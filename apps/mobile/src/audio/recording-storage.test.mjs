import assert from "node:assert/strict";
import test from "node:test";

import {
  getRecordingStorageStatus,
  isRecordingStorageCritical,
  MOBILE_RECORDING_BYTES_PER_SECOND,
  RECORDING_STORAGE_RESERVE_BYTES,
} from "./recording-storage.ts";

test("allows capture when storage capacity cannot be read", () => {
  assert.deepEqual(getRecordingStorageStatus(null), {
    canStart: true,
    estimatedSeconds: null,
  });
});

test("requires a safety reserve plus fifteen minutes of PCM capture", () => {
  const fourteenMinutes =
    RECORDING_STORAGE_RESERVE_BYTES +
    MOBILE_RECORDING_BYTES_PER_SECOND * 14 * 60;
  const fifteenMinutes =
    RECORDING_STORAGE_RESERVE_BYTES +
    MOBILE_RECORDING_BYTES_PER_SECOND * 15 * 60;

  assert.equal(getRecordingStorageStatus(fourteenMinutes).canStart, false);
  assert.equal(getRecordingStorageStatus(fifteenMinutes).canStart, true);
});

test("treats the reserve boundary as critical during capture", () => {
  assert.equal(
    isRecordingStorageCritical(RECORDING_STORAGE_RESERVE_BYTES),
    true,
  );
  assert.equal(
    isRecordingStorageCritical(RECORDING_STORAGE_RESERVE_BYTES + 1),
    false,
  );
});

test("estimates four hours of mobile PCM at about 461 MB", () => {
  const fourHours = 4 * 60 * 60;
  const availableBytes =
    RECORDING_STORAGE_RESERVE_BYTES +
    MOBILE_RECORDING_BYTES_PER_SECOND * fourHours;

  assert.equal(
    getRecordingStorageStatus(availableBytes).estimatedSeconds,
    fourHours,
  );
});
