import { useEffect, useRef } from "react";

import { sonnerToast } from "@anlg/ui/components/ui/toast";

import { useListener } from "./contexts";
import {
  isRecordingStorageCritical,
  readRecordingSafetyStatus,
} from "./recording-safety";

const STORAGE_CHECK_INTERVAL_MS = 30_000;

export function RecordingSafetyLifecycle() {
  const active = useListener((state) => state.live.status === "active");
  const stop = useListener((state) => state.stop);
  const stopRef = useRef(stop);
  stopRef.current = stop;

  useEffect(() => {
    if (!active) {
      return;
    }

    let cancelled = false;
    let stopping = false;
    const checkStorage = async () => {
      const safety = await readRecordingSafetyStatus().catch(() => null);
      if (
        cancelled ||
        stopping ||
        !isRecordingStorageCritical(safety?.available_bytes ?? null)
      ) {
        return;
      }

      stopping = true;
      stopRef.current();
      sonnerToast.error("Recording stopped before storage filled up", {
        id: "recording-storage-critical",
        duration: Infinity,
        description:
          "Your recording was saved. Free some space before starting again.",
      });
    };

    void checkStorage();
    const intervalId = setInterval(checkStorage, STORAGE_CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [active]);

  return null;
}
