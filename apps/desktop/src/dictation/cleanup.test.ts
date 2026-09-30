import type { LanguageModel } from "ai";
import { expect, it, vi } from "vitest";

import { cleanDictation } from "./cleanup";

const generate = vi.hoisted(() => vi.fn());
vi.mock("ai", () => ({ generateText: generate }));

it("uses only the selected model and refuses an empty cleanup result", async () => {
  const model = {} as LanguageModel;
  generate.mockResolvedValueOnce({ text: "Hello, world." });
  const signal = new AbortController().signal;
  expect(await cleanDictation("um hello world", model, signal)).toBe(
    "Hello, world.",
  );
  expect(generate.mock.calls[0][0].model).toBe(model);
  generate.mockResolvedValueOnce({ text: " " });
  await expect(cleanDictation("Original words", model, signal)).rejects.toThrow(
    "no text",
  );
  generate.mockResolvedValueOnce({
    text: "Truncated words",
    finishReason: "length",
  });
  await expect(cleanDictation("Original words", model, signal)).rejects.toThrow(
    "truncated",
  );
  generate.mockClear();
  await expect(cleanDictation("Original words", null, signal)).rejects.toThrow(
    "No language model",
  );
  expect(generate).not.toHaveBeenCalled();
});
