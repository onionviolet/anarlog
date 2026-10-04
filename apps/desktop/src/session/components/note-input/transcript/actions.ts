import { t } from "@lingui/core/macro";
import { useCallback } from "react";

import { commands as fsSyncCommands } from "@anlg/plugin-fs-sync";
import { toast } from "@anlg/ui/components/ui/toast";

import { withCloudsyncActivity } from "~/db/cloudsync-activity";
import { getEnhancerService } from "~/services/enhancer";
import { useConfigValue } from "~/shared/config";
import { useListener } from "~/stt/contexts";
import {
  isStoppedTranscriptionError,
  useRunBatch,
  type RunOptions,
} from "~/stt/useRunBatch";

export function useRegenerateTranscript(sessionId: string) {
  const runBatch = useRunBatch(sessionId);
  const handleBatchFailed = useListener((state) => state.handleBatchFailed);
  const autoSummaryAfterRecording =
    useConfigValue("auto_summary_after_recording") !== false;

  return useCallback(
    async (
      options?: Pick<
        RunOptions,
        "provider" | "model" | "baseUrl" | "apiKey" | "languages" | "signal"
      >,
    ) => {
      const result = await fsSyncCommands.audioPath(sessionId);
      if (result.status === "error") {
        toast.error(t`Recording not found. It may have been deleted.`, {
          id: `transcript-regenerate-audio-missing-${sessionId}`,
        });
        return false;
      }

      const audioPath = result.data;

      try {
        await withCloudsyncActivity(
          "transcription",
          `${sessionId}:retranscription:${crypto.randomUUID()}`,
          async () => {
            await runBatch(audioPath, {
              ...options,
              allowFallback: false,
              promotion: { scope: "whole_session" },
            });
            if (autoSummaryAfterRecording) {
              await getEnhancerService()?.queueAutoEnhanceIfSummaryEmpty(
                sessionId,
              );
            }
          },
        );
        return true;
      } catch (error) {
        if (options?.signal?.aborted || isStoppedTranscriptionError(error)) {
          return false;
        }
        const msg = error instanceof Error ? error.message : String(error);
        handleBatchFailed(sessionId, msg);
        toast.error(t`Re-transcription failed`, {
          id: `transcript-regenerate-failed-${sessionId}`,
          description: msg,
        });
        return false;
      }
    },
    [autoSummaryAfterRecording, handleBatchFailed, runBatch, sessionId],
  );
}
