#[cfg(target_os = "macos")]
use std::collections::BTreeSet;
#[cfg(target_os = "macos")]
use std::sync::mpsc;

pub struct RecordingSleepPrevention {
    #[cfg(target_os = "macos")]
    sender: Option<mpsc::Sender<Command>>,
}

impl Default for RecordingSleepPrevention {
    fn default() -> Self {
        Self::new()
    }
}

impl RecordingSleepPrevention {
    pub fn new() -> Self {
        #[cfg(target_os = "macos")]
        {
            let (sender, receiver) = mpsc::channel();
            match std::thread::Builder::new()
                .name("recording-sleep-prevention".to_string())
                .spawn(move || run_worker(receiver))
            {
                Ok(_) => Self {
                    sender: Some(sender),
                },
                Err(error) => {
                    tracing::warn!(?error, "failed_to_start_recording_sleep_prevention");
                    Self { sender: None }
                }
            }
        }

        #[cfg(not(target_os = "macos"))]
        Self {}
    }

    pub fn start(&self, _session_id: &str) {
        #[cfg(target_os = "macos")]
        self.send(Command::Start(_session_id.to_string()));
    }

    pub fn stop(&self, _session_id: &str) {
        #[cfg(target_os = "macos")]
        self.send(Command::Stop(_session_id.to_string()));
    }

    #[cfg(target_os = "macos")]
    fn send(&self, command: Command) {
        if self
            .sender
            .as_ref()
            .is_some_and(|sender| sender.send(command).is_err())
        {
            tracing::warn!("recording_sleep_prevention_worker_unavailable");
        }
    }
}

#[cfg(target_os = "macos")]
enum Command {
    Start(String),
    Stop(String),
}

#[cfg(target_os = "macos")]
fn run_worker(receiver: mpsc::Receiver<Command>) {
    use objc2_foundation::{NSActivityOptions, NSProcessInfo, NSString};

    let process_info = NSProcessInfo::processInfo();
    let reason = NSString::from_str("Anarlog is recording");
    let mut active_sessions = BTreeSet::new();
    let mut activity = None;

    while let Ok(command) = receiver.recv() {
        let was_active = !active_sessions.is_empty();
        match command {
            Command::Start(session_id) => {
                active_sessions.insert(session_id);
            }
            Command::Stop(session_id) => {
                active_sessions.remove(&session_id);
            }
        }
        let is_active = !active_sessions.is_empty();

        if !was_active && is_active {
            activity = Some(process_info.beginActivityWithOptions_reason(
                NSActivityOptions::IdleDisplaySleepDisabled
                    | NSActivityOptions::IdleSystemSleepDisabled,
                &reason,
            ));
            tracing::info!("recording_sleep_prevention_started");
        } else if was_active && !is_active {
            if let Some(activity) = activity.take() {
                // SAFETY: This is the exact activity token returned by this NSProcessInfo instance.
                unsafe { process_info.endActivity(&activity) };
            }
            tracing::info!("recording_sleep_prevention_stopped");
        }
    }

    if let Some(activity) = activity {
        // SAFETY: This is the exact activity token returned by this NSProcessInfo instance.
        unsafe { process_info.endActivity(&activity) };
    }
}
