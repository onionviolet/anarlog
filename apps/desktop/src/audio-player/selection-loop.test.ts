import { describe, expect, it } from "vitest";

import { SelectionLoop } from "./selection-loop";

describe("selected audio playback", () => {
  it("restarts at the selection boundary and stops repeating after clearing", () => {
    const loop = new SelectionLoop();
    expect(loop.select(4, 8, 20)).toBe(true);
    expect(loop.restartAt(7.9)).toBeNull();
    expect(loop.restartAt(8)).toBe(4);
    expect(loop.restartAt(9)).toBe(4);
    loop.clear();
    expect(loop.restartAt(9)).toBeNull();
  });

  it("clamps selection to available audio and rejects empty or invalid ranges", () => {
    const loop = new SelectionLoop();
    expect(loop.select(-1, 30, 20)).toBe(true);
    expect(loop.restartAt(20)).toBe(0);
    for (const range of [
      [3, 3, 20],
      [25, 30, 20],
      [0, 1, 0],
      [0, NaN, 20],
    ]) {
      expect(loop.select(...(range as [number, number, number]))).toBe(false);
      expect(loop.restartAt(30)).toBeNull();
    }
  });
});
