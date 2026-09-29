import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { renderHook } from "@testing-library/react";
import { generateText, streamText } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeLLMProviderId, useLanguageModel } from "./useLLMConnection";

const fixture = vi.hoisted(() => ({
  provider: {
    type: "llm",
    base_url: "http://127.0.0.1:8000/v1",
    api_key: "local-key",
  },
  values: {
    current_llm_provider: "custom",
    current_llm_model: "mtplx",
    current_llm_reasoning_effort: "default",
  },
}));

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));
vi.mock("~/auth", () => ({ useAuth: () => ({ session: null }) }));
vi.mock("~/auth/billing-context", () => ({
  useBillingAccess: () => ({ isPaid: false }),
}));
vi.mock("~/settings/providers", () => ({
  useAiProvider: () => fixture.provider,
}));
vi.mock("~/shared/config", () => ({
  useConfigValues: () => fixture.values,
}));

beforeEach(() => {
  fixture.provider = {
    type: "llm",
    base_url: "http://127.0.0.1:8000/v1",
    api_key: "local-key",
  };
  fixture.values = {
    current_llm_provider: "custom",
    current_llm_model: "mtplx",
    current_llm_reasoning_effort: "default",
  };
  vi.mocked(tauriFetch).mockReset();
});

it.each([false, true])(
  "generates through Custom with an origin-restricted local server (stream: %s)",
  async (stream) => {
    vi.mocked(tauriFetch).mockImplementation(async (input, init) => {
      const headers = new Headers(init?.headers);
      if (headers.get("Origin") !== "")
        return new Response(null, { status: 403 });
      if (headers.get("Authorization") !== "Bearer local-key")
        return new Response(null, { status: 401 });
      expect(String(input)).toBe("http://127.0.0.1:8000/v1/chat/completions");
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("mtplx");
      if (body.stream) {
        const chunk = {
          id: "local-completion",
          model: "mtplx",
          created: 0,
          choices: [
            {
              index: 0,
              delta: { content: "Local summary" },
              finish_reason: "stop",
            },
          ],
        };
        return new Response(
          `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`,
          { headers: { "Content-Type": "text/event-stream" } },
        );
      }
      return Response.json({
        id: "local-completion",
        model: "mtplx",
        created: 0,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Local summary" },
            finish_reason: "stop",
          },
        ],
      });
    });

    const { result, unmount } = renderHook(() => useLanguageModel());
    expect(result.current).not.toBeNull();
    const options = {
      model: result.current!,
      prompt: "Summarize the meeting",
      maxRetries: 0,
    };
    const completion = stream
      ? streamText(options)
      : await generateText(options);
    expect(await completion.text).toBe("Local summary");
    unmount();
  },
);

it("sends disabled reasoning to Ollama summary requests", async () => {
  fixture.provider = {
    type: "llm",
    base_url: "http://127.0.0.1:11434/v1",
    api_key: "",
  };
  fixture.values = {
    current_llm_provider: "ollama",
    current_llm_model: "qwen3.5:4b",
    current_llm_reasoning_effort: "high",
  };
  vi.mocked(tauriFetch).mockImplementation(async (input, init) => {
    expect(String(input)).toBe("http://127.0.0.1:11434/v1/chat/completions");
    const body = JSON.parse(String(init?.body));
    expect(body.reasoning_effort).toBe("none");
    return Response.json({
      id: "ollama-completion",
      model: "qwen3.5:4b",
      created: 0,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Local summary" },
          finish_reason: "stop",
        },
      ],
    });
  });

  const { result, unmount } = renderHook(() => useLanguageModel("enhance"));
  expect(result.current).not.toBeNull();
  const completion = await generateText({
    model: result.current!,
    prompt: "Summarize the meeting",
    maxRetries: 0,
  });
  expect(completion.text).toBe("Local summary");
  unmount();
});

describe("normalizeLLMProviderId", () => {
  it("maps the legacy hosted provider id to Anarlog", () => {
    expect(normalizeLLMProviderId("hyprnote")).toBe("anarlog");
  });

  it("preserves current provider ids", () => {
    expect(normalizeLLMProviderId("openai")).toBe("openai");
  });
});
