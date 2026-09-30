use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use owhisper_client::DeepgramAdapter;
use owhisper_interface::batch::Response;
use owhisper_interface::batch_stream::BatchStreamEvent;
use sha2::{Digest, Sha256};

use super::simple::direct::{merge_segment_responses, run_direct_batch_with_timeout};
use super::{BatchParams, BatchProvider, BatchRunOutput};
use crate::{BatchEvent, BatchRuntime};

const PART_SECONDS: u64 = 120;
const OVERLAP_SECONDS: u64 = 2;
const PART_TIMEOUT: Duration = Duration::from_secs(5 * 60);

pub(super) fn is_local_r2t2(params: &BatchParams) -> bool {
    matches!(params.provider, BatchProvider::Deepgram)
        && params
            .model
            .as_deref()
            .is_some_and(|model| model.starts_with("r2t2-"))
        && url::Url::parse(&params.base_url).ok().is_some_and(|url| {
            matches!(url.scheme(), "http" | "https" | "ws" | "wss")
                && matches!(
                    url.host_str(),
                    Some("localhost" | "127.0.0.1" | "[::1]" | "::1")
                )
        })
}

fn failure(message: impl Into<String>) -> crate::Error {
    crate::BatchFailure::DirectRequestFailed {
        provider: "R2T2".into(),
        message: message.into(),
    }
    .into()
}

fn cancelled(runtime: &dyn BatchRuntime) -> crate::Result<()> {
    if runtime.is_cancelled() {
        Err(failure("Transcription stopped."))
    } else {
        Ok(())
    }
}

fn fingerprint(params: &BatchParams) -> crate::Result<String> {
    let mut file = std::fs::File::open(&params.file_path)?;
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    // Credentials do not affect transcription output and must never enter a
    // checkpoint. Source bytes and every decoding choice invalidate old parts.
    digest.update(
        serde_json::to_vec(&serde_json::json!({
            "version": 1, "part_seconds": PART_SECONDS, "overlap_seconds": OVERLAP_SECONDS,
            "session": params.session_id, "base_url": params.base_url,
            "model": params.model, "languages": params.languages, "keywords": params.keywords,
            "num_speakers": params.num_speakers, "min_speakers": params.min_speakers,
            "max_speakers": params.max_speakers,
        }))
        .map_err(|_| failure("Could not prepare the R2T2 checkpoint."))?,
    );
    Ok(digest
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

fn emit_progress(runtime: &dyn BatchRuntime, session_id: &str, completed: usize, total: usize) {
    runtime.emit(BatchEvent::BatchResponseStreamed {
        session_id: session_id.to_string(),
        event: BatchStreamEvent::Progress {
            percentage: 0.95 * completed as f64 / total as f64,
            partial_text: Some(format!("r2t2-parts:{completed}:{total}")),
        },
    });
}

pub(super) async fn run(
    runtime: Arc<dyn BatchRuntime>,
    params: BatchParams,
    mut listen_params: owhisper_interface::ListenParams,
) -> crate::Result<BatchRunOutput> {
    cancelled(runtime.as_ref())?;
    let identity_params = params.clone();
    let key = tokio::task::spawn_blocking(move || fingerprint(&identity_params))
        .await
        .map_err(|_| failure("Could not inspect the R2T2 source recording."))??;
    let parent = Path::new(&params.file_path)
        .parent()
        .ok_or_else(|| failure("The recording has no storage folder."))?;
    let checkpoint = parent.join(".r2t2-parts").join(&key);
    std::fs::create_dir_all(&checkpoint)?;
    let temp = super::upload::temporary_audio_directory(&params.file_path)?;
    let source = PathBuf::from(&params.file_path);
    let output = temp.path().to_path_buf();
    emit_progress(runtime.as_ref(), &params.session_id, 0, 1);
    let paths = tokio::task::spawn_blocking(move || {
        anlg_mp3::encode_mono_segments_with_overlap(
            &source,
            &output,
            Duration::from_secs(PART_SECONDS),
            Duration::from_secs(OVERLAP_SECONDS),
        )
    })
    .await
    .map_err(|_| failure("Could not prepare R2T2 audio parts."))?
    .map_err(|_| failure("Could not split this recording for R2T2."))?;
    if paths.is_empty() {
        return Err(failure("This recording has no audio to transcribe."));
    }
    listen_params.channels = 1;
    let mut responses = Vec::with_capacity(paths.len());
    let total = paths.len();
    emit_progress(runtime.as_ref(), &params.session_id, 0, total);
    for (index, path) in paths.iter().enumerate() {
        cancelled(runtime.as_ref())?;
        let part_file = checkpoint.join(format!("part-{index:04}.json"));
        let cached = std::fs::read(&part_file)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Response>(&bytes).ok())
            .filter(|response| trim_overlap(response.clone(), index, total).is_ok());
        let response = if let Some(response) = cached {
            response
        } else {
            let mut part_params = params.clone();
            part_params.file_path = path.to_string_lossy().into_owned();
            let request = run_direct_batch_with_timeout::<DeepgramAdapter>(
                "R2T2",
                part_params,
                listen_params.clone(),
                PART_TIMEOUT,
            );
            tokio::pin!(request);
            let output = loop {
                tokio::select! {
                    result = &mut request => break result.map_err(|error| failure(format!("R2T2 part {} of {total} failed: {error} Completed parts and the original recording were kept; retry to resume.", index + 1)))?,
                    _ = tokio::time::sleep(Duration::from_millis(250)) => cancelled(runtime.as_ref())?,
                }
            };
            cancelled(runtime.as_ref())?;
            trim_overlap(output.response.clone(), index, total)?;
            let pending = part_file.with_extension("json.next");
            let bytes = serde_json::to_vec(&output.response)
                .map_err(|_| failure("Could not save the R2T2 part."))?;
            std::fs::write(&pending, bytes)?;
            std::fs::File::open(&pending)?.sync_all()?;
            std::fs::rename(pending, &part_file)?;
            output.response
        };
        responses.push(trim_overlap(response, index, total)?);
        emit_progress(runtime.as_ref(), &params.session_id, index + 1, total);
    }
    cancelled(runtime.as_ref())?;
    let mut response = merge_segment_responses(responses, Duration::from_secs(PART_SECONDS));
    // Keep completed parts through speaker labeling and transcript promotion.
    // The desktop acknowledges them only after the saved replacement succeeds.
    if !response.metadata.is_object() {
        response.metadata = serde_json::json!({});
    }
    response.metadata["r2t2_parts_checkpoint"] = serde_json::Value::String(key);
    Ok(BatchRunOutput {
        session_id: params.session_id,
        mode: super::BatchRunMode::Direct,
        response,
    })
}

pub fn clear_completed_r2t2_parts(source: &str, response: &Response) -> std::io::Result<()> {
    let Some(key) = response
        .metadata
        .get("r2t2_parts_checkpoint")
        .and_then(serde_json::Value::as_str)
    else {
        return Ok(());
    };
    if key.len() != 64 || !key.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Ok(());
    }
    let Some(parent) = Path::new(source).parent() else {
        return Ok(());
    };
    match std::fs::remove_dir_all(parent.join(".r2t2-parts").join(key)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

fn trim_overlap(mut response: Response, index: usize, total: usize) -> crate::Result<Response> {
    if response.results.channels.len() != 1 {
        return Err(failure("R2T2 returned an invalid audio channel count."));
    }
    let alternative = response.results.channels[0]
        .alternatives
        .first_mut()
        .ok_or_else(|| failure("R2T2 returned no transcript result."))?;
    let prefix = if index > 0 {
        OVERLAP_SECONDS as f64
    } else {
        0.0
    };
    let lower = if index > 0 {
        OVERLAP_SECONDS as f64 / 2.0
    } else {
        0.0
    };
    let upper = if index + 1 < total {
        PART_SECONDS as f64 + prefix - OVERLAP_SECONDS as f64 / 2.0
    } else {
        f64::INFINITY
    };
    if alternative.words.iter().any(|word| {
        !word.start.is_finite()
            || !word.end.is_finite()
            || word.end < word.start
            || word.start < 0.0
            || word.end > PART_SECONDS as f64 + prefix + 1.0
    }) {
        return Err(failure(
            "R2T2 returned invalid part timestamps. Your previous transcript was kept.",
        ));
    }
    if alternative.words.is_empty() && !alternative.transcript.trim().is_empty() {
        return Err(failure("R2T2 returned text without part timestamps."));
    }
    alternative.words.retain(|word| {
        let midpoint = (word.start + word.end) / 2.0;
        midpoint >= lower && midpoint < upper
    });
    for word in &mut alternative.words {
        word.start -= prefix;
        word.end -= prefix;
    }
    alternative.transcript = alternative
        .words
        .iter()
        .map(|word| word.punctuated_word.as_deref().unwrap_or(&word.word))
        .collect::<Vec<_>>()
        .join(" ");
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::super::test_fixtures::params;
    use super::*;
    use owhisper_interface::batch::{Alternatives, Channel, Results, Word};

    #[tokio::test]
    async fn cancellation_keeps_completed_parts_and_retry_resumes_without_replacing_them() {
        use axum::{Json, Router, routing::post};
        use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
        struct CancelAfterPart(AtomicBool);
        impl BatchRuntime for CancelAfterPart {
            fn emit(&self, event: BatchEvent) {
                if matches!(event, BatchEvent::BatchResponseStreamed { event: BatchStreamEvent::Progress { percentage, .. }, .. } if percentage > 0.0)
                {
                    self.0.store(true, Ordering::SeqCst);
                }
            }
            fn is_cancelled(&self) -> bool {
                self.0.load(Ordering::SeqCst)
            }
        }
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("audio.wav");
        let mut writer = hound::WavWriter::create(
            &source,
            hound::WavSpec {
                channels: 1,
                sample_rate: 16_000,
                bits_per_sample: 16,
                sample_format: hound::SampleFormat::Int,
            },
        )
        .unwrap();
        for _ in 0..121 * 16_000 {
            writer.write_sample(0i16).unwrap();
        }
        writer.finalize().unwrap();
        let requests = Arc::new(AtomicUsize::new(0));
        let app = Router::new().route("/v1/listen", post({
            let requests = requests.clone();
            move |_body: axum::body::Bytes| { let index = requests.fetch_add(1, Ordering::SeqCst); async move {
                let text = if index == 0 { "original-first-part" } else { "resumed-second-part" };
                let start = if index == 0 { 0.4 } else { 2.4 };
                Json(serde_json::json!({ "metadata": {}, "results": { "channels": [{ "alternatives": [{ "transcript": text, "confidence": 1.0, "words": [{ "word": text, "start": start, "end": start + 0.4, "confidence": 1.0 }] }] }] } }))
            } }
        }));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base_url = format!("http://{}/v1", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        let mut input = params(BatchProvider::Deepgram, &base_url, source.to_str().unwrap());
        input.model = Some("r2t2-asr-stream".into());
        let listen = owhisper_interface::ListenParams {
            model: input.model.clone(),
            ..Default::default()
        };
        let stopped = run(
            Arc::new(CancelAfterPart(AtomicBool::new(false))),
            input.clone(),
            listen.clone(),
        )
        .await;
        let error = stopped.unwrap_err().to_string();
        assert!(error.contains("stopped"), "{error}");
        let saved = root
            .path()
            .join(".r2t2-parts")
            .join(fingerprint(&input).unwrap());
        assert!(saved.join("part-0000.json").exists());
        let output = run(
            Arc::new(super::super::test_fixtures::NeverCancelled),
            input,
            listen,
        )
        .await
        .unwrap();
        let words = &output.response.results.channels[0].alternatives[0].words;
        assert_eq!(
            words
                .iter()
                .map(|word| word.word.as_str())
                .collect::<Vec<_>>(),
            vec!["original-first-part", "resumed-second-part"]
        );
        assert!((words[1].start - 120.4).abs() < 0.001);
        assert!(saved.exists());
        clear_completed_r2t2_parts(source.to_str().unwrap(), &output.response).unwrap();
        assert!(!saved.exists());
        assert!(source.exists());
        server.abort();
    }

    #[test]
    fn overlapping_parts_keep_one_boundary_word_and_absolute_timestamps() {
        let response = |start: f64, end: f64| Response {
            metadata: serde_json::json!({}),
            results: Results {
                channels: vec![Channel {
                    alternatives: vec![Alternatives {
                        transcript: "boundary".into(),
                        confidence: 1.0,
                        words: vec![Word {
                            word: "boundary".into(),
                            start,
                            end,
                            confidence: 1.0,
                            channel: 0,
                            speaker: None,
                            punctuated_word: None,
                        }],
                    }],
                }],
            },
        };
        let first = trim_overlap(response(119.0, 119.5), 0, 2).unwrap();
        let second = trim_overlap(response(1.0, 1.5), 1, 2).unwrap();
        let merged =
            merge_segment_responses(vec![first, second], Duration::from_secs(PART_SECONDS));
        let words = &merged.results.channels[0].alternatives[0].words;
        assert_eq!(words.len(), 1);
        assert_eq!(words[0].start, 119.0);
        assert_eq!(words[0].end, 119.5);
    }

    #[test]
    fn checkpoints_change_with_source_or_decoding_settings_and_only_loopback_r2t2_is_chunked() {
        let file = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(file.path(), b"audio-one").unwrap();
        let mut input = params(
            BatchProvider::Deepgram,
            "http://127.0.0.1:8490",
            file.path().to_str().unwrap(),
        );
        input.model = Some("r2t2-asr-stream".into());
        assert!(is_local_r2t2(&input));
        let original = fingerprint(&input).unwrap();
        input.api_key = "private-token".into();
        assert_eq!(original, fingerprint(&input).unwrap());
        input.keywords.push("medicine".into());
        assert_ne!(original, fingerprint(&input).unwrap());
        input.keywords.clear();
        std::fs::write(file.path(), b"audio-two").unwrap();
        assert_ne!(original, fingerprint(&input).unwrap());
        input.base_url = "https://api.deepgram.com/v1".into();
        assert!(!is_local_r2t2(&input));
    }
}
