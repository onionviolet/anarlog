import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";

import { type AudioImportJob, useAudioImportQueue } from "./audio-import-queue";
import { useListener } from "./contexts";
import { isStoppedTranscriptionError } from "./useRunBatch";
import { useUploadFile } from "./useUploadFile";

import { useAuth } from "~/auth";
import { preloadSession } from "~/session/queries";
import { useMountEffect } from "~/shared/hooks/useMountEffect";
import { useTabs } from "~/store/zustand/tabs";

export function AudioImportQueueView() {
  const auth = useAuth();
  return <ScopedAudioImportQueueView key={auth.session?.user?.id ?? "local"} />;
}

function ScopedAudioImportQueueView() {
  const mounted = useRef(false);
  const [ready, setReady] = useState(false);
  useMountEffect(() => {
    mounted.current = true;
    queueMicrotask(() => {
      if (mounted.current) setReady(true);
    });
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (!mounted.current) useAudioImportQueue.getState().abandon();
      });
    };
  });
  const jobs = useAudioImportQueue((state) => state.jobs);
  const job = jobs.find((item) =>
    ["pending", "running", "cancelling"].includes(item.status),
  );
  const visibleJobs = jobs.filter((item) => !item.abandoned);
  if (!ready || visibleJobs.length === 0) return null;
  return (
    <>
      {job && !job.abandoned && (
        <ReadyAudioImportWorker key={job.id} job={job} />
      )}
      {createPortal(
        <aside
          aria-label="Audio import queue"
          className="bg-background fixed right-4 bottom-4 max-h-72 w-80 max-w-[calc(100vw-2rem)] overflow-auto rounded-lg border p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">
              <Trans>Audio imports</Trans>
            </span>
            <button
              className="text-xs underline"
              onClick={() => useAudioImportQueue.getState().dismiss()}
            >
              <Trans>Clear finished</Trans>
            </button>
          </div>
          {visibleJobs.map((item) => (
            <QueueRow key={item.id} job={item} />
          ))}
        </aside>,
        document.body,
      )}
    </>
  );
}

function ReadyAudioImportWorker({ job }: { job: AudioImportJob }) {
  const session = useQuery({
    queryKey: ["audio-import-session", job.id, job.sessionId],
    queryFn: () => preloadSession(job.sessionId, { fresh: true }),
    retry: false,
  });
  if (session.isPending) return null;
  if (session.error || !session.data)
    return (
      <MissingAudioImportWorker
        job={job}
        error={
          session.error ??
          new Error("The note was deleted before its audio could be imported.")
        }
      />
    );
  return <AudioImportWorker job={job} />;
}

function MissingAudioImportWorker({
  job,
  error,
}: {
  job: AudioImportJob;
  error: Error;
}) {
  useMountEffect(() => {
    void useAudioImportQueue.getState().run(job.id, async () => {
      throw error;
    });
  });
  return null;
}

function AudioImportWorker({ job }: { job: AudioImportJob }) {
  const { processFile, processAudioFile } = useUploadFile(job.sessionId);
  useMountEffect(() => {
    let mounted = true;
    let ownsJob = false;
    queueMicrotask(() => {
      if (!mounted) return;
      ownsJob = true;
      void useAudioImportQueue.getState().run(job.id, async (signal) => {
        const options = { ...job.options, signal };
        try {
          await (typeof job.source === "string"
            ? processFile(job.source, "audio", options)
            : processAudioFile(job.source, options));
        } catch (error) {
          if (isStoppedTranscriptionError(error))
            useAudioImportQueue.getState().cancel(job.id);
          throw error;
        }
      });
    });
    return () => {
      mounted = false;
      if (ownsJob) useAudioImportQueue.getState().cancel(job.id);
    };
  });
  return null;
}

function QueueRow({ job }: { job: AudioImportJob }) {
  const progress = useListener(
    (state) => state.batch[job.sessionId]?.percentage,
  );
  return (
    <div className="mb-2 flex items-start justify-between gap-2 text-xs">
      <div className="min-w-0">
        <button
          className="block max-w-full truncate text-left underline"
          onClick={() =>
            useTabs.getState().openNew({ type: "sessions", id: job.sessionId })
          }
        >
          {job.name}
        </button>
        <p role="status">
          {job.status === "pending" ? (
            <Trans>Queued</Trans>
          ) : job.status === "running" ? (
            <>
              <Trans>Processing</Trans>
              {typeof progress === "number"
                ? ` ${Math.round(progress * 100)}%`
                : ""}
            </>
          ) : job.status === "cancelling" ? (
            <Trans>Cancelling</Trans>
          ) : job.status === "completed" ? (
            <Trans>Completed</Trans>
          ) : job.status === "failed" ? (
            <Trans>Failed</Trans>
          ) : (
            <Trans>Cancelled</Trans>
          )}
        </p>
        {job.error && <p className="text-destructive">{job.error}</p>}
      </div>
      {["pending", "running"].includes(job.status) && (
        <button
          className="shrink-0 underline"
          onClick={() => useAudioImportQueue.getState().cancel(job.id)}
        >
          <Trans>Cancel</Trans>
        </button>
      )}
    </div>
  );
}
