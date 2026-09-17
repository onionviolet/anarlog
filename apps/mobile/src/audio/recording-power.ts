import { BatteryState, type PowerState } from "expo-battery";

const LOW_RECORDING_BATTERY_LEVEL = 0.15;

export function recordingPowerWarning(power: PowerState): string | null {
  if (
    power.batteryLevel < 0 ||
    power.batteryLevel > LOW_RECORDING_BATTERY_LEVEL ||
    power.batteryState !== BatteryState.UNPLUGGED
  ) {
    return power.lowPowerMode ? "Low Power Mode" : null;
  }

  return `Battery ${Math.round(power.batteryLevel * 100)}% · plug in soon`;
}
