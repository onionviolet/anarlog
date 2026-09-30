import type { TranscriptExportSegment } from "./export-data";

export function formatCaptionExport(
  segments: TranscriptExportSegment[],
  format: "srt" | "vtt",
): string {
  const cues = segments.flatMap((segment) => {
    const text = segment.text.replace(/\s+/gu, " ").trim();
    if (
      !text ||
      !Number.isFinite(segment.start_ms) ||
      !Number.isFinite(segment.end_ms)
    ) {
      return [];
    }
    const start = Math.max(0, Math.round(segment.start_ms));
    const end = Math.round(segment.end_ms);
    if (end <= start) return [];
    const speaker = segment.speaker?.replace(/\s+/gu, " ").trim();
    const payload =
      format === "vtt"
        ? speaker
          ? `<v ${escapeCaptionText(speaker)}>${escapeCaptionText(text)}</v>`
          : escapeCaptionText(text)
        : escapeCaptionText(speaker ? `${speaker}: ${text}` : text);
    return [{ start, end, payload }];
  });

  const body = cues
    .map(
      (cue, index) =>
        `${index + 1}\n${formatTimestamp(cue.start, format)} --> ${formatTimestamp(cue.end, format)}\n${cue.payload}`,
    )
    .join("\n\n");
  return `${format === "vtt" ? "WEBVTT\n\n" : ""}${body}${body ? "\n" : ""}`;
}

function formatTimestamp(milliseconds: number, format: "srt" | "vtt") {
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor(milliseconds / 60_000) % 60;
  const seconds = Math.floor(milliseconds / 1_000) % 60;
  const fraction = milliseconds % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${format === "srt" ? "," : "."}${String(fraction).padStart(3, "0")}`;
}

function escapeCaptionText(text: string) {
  return text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}
