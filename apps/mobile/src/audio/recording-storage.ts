export const MOBILE_RECORDING_BYTES_PER_SECOND = 16_000 * 2;
export const RECORDING_STORAGE_RESERVE_BYTES = 256 * 1024 * 1024;

const MINIMUM_START_DURATION_SECONDS = 15 * 60;

export function getRecordingStorageStatus(availableBytes: number | null): {
  canStart: boolean;
  estimatedSeconds: number | null;
} {
  if (availableBytes === null || !Number.isFinite(availableBytes)) {
    return { canStart: true, estimatedSeconds: null };
  }

  const usableBytes = Math.max(
    0,
    Math.floor(availableBytes) - RECORDING_STORAGE_RESERVE_BYTES,
  );
  const estimatedSeconds = Math.floor(
    usableBytes / MOBILE_RECORDING_BYTES_PER_SECOND,
  );
  return {
    canStart: estimatedSeconds >= MINIMUM_START_DURATION_SECONDS,
    estimatedSeconds,
  };
}

export function isRecordingStorageCritical(
  availableBytes: number | null,
): boolean {
  return (
    availableBytes !== null &&
    Number.isFinite(availableBytes) &&
    availableBytes <= RECORDING_STORAGE_RESERVE_BYTES
  );
}
