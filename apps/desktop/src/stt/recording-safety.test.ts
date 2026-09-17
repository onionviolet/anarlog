import { describe, expect, test, vi } from "vitest";

import {
  DESKTOP_RECORDING_BYTES_PER_SECOND,
  RECORDING_STORAGE_RESERVE_BYTES,
  getRecordingStorageStatus,
  isRecordingStorageCritical,
} from "./recording-safety";

vi.mock("@anlg/plugin-transcription", () => ({
  commands: { recordingSafetyStatus: vi.fn() },
}));

describe("desktop recording storage safety", () => {
  test("requires the reserve plus fifteen minutes of stereo float audio", () => {
    const minimum =
      RECORDING_STORAGE_RESERVE_BYTES +
      DESKTOP_RECORDING_BYTES_PER_SECOND * 15 * 60;

    expect(getRecordingStorageStatus(minimum - 1).canStart).toBe(false);
    expect(getRecordingStorageStatus(minimum).canStart).toBe(true);
  });

  test("allows capture when storage reporting is unavailable", () => {
    expect(getRecordingStorageStatus(null)).toEqual({
      canStart: true,
      estimatedSeconds: null,
    });
  });

  test("treats the reserve boundary as critical during capture", () => {
    expect(isRecordingStorageCritical(RECORDING_STORAGE_RESERVE_BYTES)).toBe(
      true,
    );
    expect(
      isRecordingStorageCritical(RECORDING_STORAGE_RESERVE_BYTES + 1),
    ).toBe(false);
  });
});
