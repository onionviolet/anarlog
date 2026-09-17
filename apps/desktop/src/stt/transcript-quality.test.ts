import { describe, expect, test } from "vitest";

import { isTranscriptDegradedByRepetition } from "./transcript-quality";

const distinctWords = (count: number) =>
  Array.from({ length: count }, (_, index) => `word-${index}`);

describe("isTranscriptDegradedByRepetition", () => {
  test("accepts ordinary speech with occasional repeated words", () => {
    const words = distinctWords(500);
    words.splice(100, 0, "very", "very");
    words.splice(350, 0, "no", "no", "no");

    expect(isTranscriptDegradedByRepetition(words)).toBe(false);
  });

  test("flags sustained adjacent repetition across a transcript", () => {
    const words = distinctWords(500).flatMap((word, index) =>
      index % 8 === 0 ? [word, word] : [word],
    );

    expect(isTranscriptDegradedByRepetition(words)).toBe(true);
  });

  test("flags a severely degraded window inside a longer transcript", () => {
    const degradedWindow = distinctWords(125).flatMap((word) => [word, word]);
    const words = [
      ...distinctWords(400),
      ...degradedWindow,
      ...distinctWords(400),
    ];

    expect(isTranscriptDegradedByRepetition(words)).toBe(true);
  });

  test("does not judge a short transcript", () => {
    expect(isTranscriptDegradedByRepetition(Array(100).fill("right"))).toBe(
      false,
    );
  });

  test("normalizes case and punctuation before comparing words", () => {
    const words = distinctWords(250);
    for (let index = 0; index < 30; index += 1) {
      words.splice(index * 2, 0, "Right,", "RIGHT");
    }

    expect(isTranscriptDegradedByRepetition(words)).toBe(true);
  });
});
