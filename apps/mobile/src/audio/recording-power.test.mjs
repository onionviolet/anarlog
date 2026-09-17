import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, _context, next) {
    if (specifier === "expo-battery") {
      return {
        url: `data:text/javascript,${encodeURIComponent("export const BatteryState = {UNKNOWN: 0, UNPLUGGED: 1, CHARGING: 2, FULL: 3, NOT_CHARGING: 4};")}`,
        shortCircuit: true,
      };
    }
    return next(specifier);
  },
});

const { recordingPowerWarning } = await import("./recording-power.ts");

test("warns when an unplugged recording device reaches fifteen percent", () => {
  assert.equal(
    recordingPowerWarning({
      batteryLevel: 0.15,
      batteryState: 1,
      lowPowerMode: false,
    }),
    "Battery 15% · plug in soon",
  );
});

test("does not warn about a low battery while charging", () => {
  assert.equal(
    recordingPowerWarning({
      batteryLevel: 0.05,
      batteryState: 2,
      lowPowerMode: false,
    }),
    null,
  );
});

test("surfaces low power mode without blocking recording", () => {
  assert.equal(
    recordingPowerWarning({
      batteryLevel: 0.8,
      batteryState: 1,
      lowPowerMode: true,
    }),
    "Low Power Mode",
  );
});
