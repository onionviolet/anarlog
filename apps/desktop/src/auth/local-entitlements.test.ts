import { describe, expect, it } from "vitest";

import {
  type ForkGatedFeature,
  hasFeature,
  runsLocally,
} from "./local-entitlements";

const LOCAL: ForkGatedFeature[] = ["dictionary", "appIcon", "automations"];
const SERVER_BACKED: ForkGatedFeature[] = ["sync", "team", "cloudApi"];

describe("fork entitlements", () => {
  it.each(LOCAL)("%s is available without a subscription", (feature) => {
    expect(runsLocally(feature)).toBe(true);
    expect(hasFeature(feature, false)).toBe(true);
  });

  it.each(SERVER_BACKED)("%s still follows billing", (feature) => {
    expect(runsLocally(feature)).toBe(false);
    expect(hasFeature(feature, false)).toBe(false);
    expect(hasFeature(feature, true)).toBe(true);
  });
});
