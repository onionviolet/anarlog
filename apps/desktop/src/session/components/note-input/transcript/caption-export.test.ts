import { describe, expect, it } from "vitest";

import { formatCaptionExport } from "./caption-export";

import { parseMeetingExport } from "~/imports/parser";

describe("subtitle export", () => {
  it.each(["srt", "vtt"] as const)(
    "round-trips %s timestamps, speakers, and literal markup while skipping invalid cues",
    (format) => {
      const content = formatCaptionExport(
        [
          {
            speaker: "Alex & Sam",
            text: "Use <draft> & review --> next",
            start_ms: 3_661_234,
            end_ms: 3_663_005,
          },
          {
            speaker: null,
            text: "A second line",
            start_ms: 3_664_000,
            end_ms: 3_665_000,
          },
          { speaker: null, text: " ", start_ms: 0, end_ms: 100 },
          {
            speaker: null,
            text: "Invalid timing",
            start_ms: Number.NaN,
            end_ms: 100,
          },
          { speaker: null, text: "Backwards", start_ms: 100, end_ms: 0 },
        ],
        format,
      );
      expect(content).toContain(
        format === "srt"
          ? "01:01:01,234 --> 01:01:03,005"
          : "01:01:01.234 --> 01:01:03.005",
      );
      expect(content.startsWith("WEBVTT")).toBe(format === "vtt");
      const [meeting] = parseMeetingExport({
        path: `/tmp/review.${format}`,
        name: `review.${format}`,
        content,
      });
      expect(meeting?.transcript).toEqual([
        {
          speaker: "Alex & Sam",
          text: "Use <draft> & review --> next",
          startMs: 3_661_234,
          endMs: 3_663_005,
        },
        {
          speaker: "",
          text: "A second line",
          startMs: 3_664_000,
          endMs: 3_665_000,
        },
      ]);
    },
  );
});
