type TranscriptWord = { text?: string | null } | string;

const MIN_WORD_COUNT = 200;
const WINDOW_WORD_COUNT = 250;
const WINDOW_STEP = 125;
const OVERALL_REPEAT_RATIO = 0.05;
const WINDOW_REPEAT_RATIO = 0.12;
const MIN_WINDOW_REPEATS = 20;

function normalizeWord(word: TranscriptWord) {
  const text = typeof word === "string" ? word : word.text;
  return (text ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function adjacentRepeatCount(words: string[]) {
  let repeats = 0;
  for (let index = 1; index < words.length; index += 1) {
    if (words[index] === words[index - 1]) {
      repeats += 1;
    }
  }
  return repeats;
}

export function isTranscriptDegradedByRepetition(words: TranscriptWord[]) {
  const normalized = words.map(normalizeWord).filter(Boolean);
  if (normalized.length < MIN_WORD_COUNT) {
    return false;
  }

  const repeatRatio =
    adjacentRepeatCount(normalized) / Math.max(1, normalized.length - 1);
  if (repeatRatio >= OVERALL_REPEAT_RATIO) {
    return true;
  }

  for (
    let start = 0;
    start + MIN_WORD_COUNT <= normalized.length;
    start += WINDOW_STEP
  ) {
    const window = normalized.slice(start, start + WINDOW_WORD_COUNT);
    const repeats = adjacentRepeatCount(window);
    if (
      repeats >= MIN_WINDOW_REPEATS &&
      repeats / Math.max(1, window.length - 1) >= WINDOW_REPEAT_RATIO
    ) {
      return true;
    }
  }

  return false;
}
