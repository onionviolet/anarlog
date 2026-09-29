import { act, cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sessions: [] as unknown[],
  record: undefined as { id: string } | undefined,
  autoSummary: true,
  runBatch: vi.fn(),
  queueSummary: vi.fn(),
  failed: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock("~/services/enhancer", () => ({
  getEnhancerService: () => ({
    queueAutoEnhanceIfSummaryEmpty: mocks.queueSummary,
  }),
}));
vi.mock("~/session/queries", () => ({ useSession: () => mocks.record }));
vi.mock("~/shared/config", () => ({ useConfigValue: () => mocks.autoSummary }));
vi.mock("~/store/zustand/listener/general-batch", () => ({
  recoverRunningBatchSessions: async (
    _getState: unknown,
    onSessions: (sessions: unknown[]) => void,
  ) => {
    onSessions(mocks.sessions);
    return mocks.dispose;
  },
}));
vi.mock("~/store/zustand/listener/instance", () => ({
  listenerStore: { getState: () => ({ handleBatchFailed: mocks.failed }) },
}));
vi.mock("~/stt/useRunBatch", () => ({
  useRunBatch: () => mocks.runBatch,
  isStoppedTranscriptionError: () => false,
}));

import { BatchTranscriptionRecovery } from "./batch-transcription-recovery";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.runBatch.mockResolvedValue(undefined);
  mocks.record = undefined;
  mocks.sessions = [
    {
      session_id: "session-1",
      file_path: "/tmp/recovery.wav",
      provider: "ollama",
      model: "local-stt",
      resume_context: JSON.stringify({ promotion: "whole_session" }),
    },
  ];
});

describe("BatchTranscriptionRecovery", () => {
  it.each([true, false])(
    "resumes audio once after the note loads, with automatic summaries %s",
    async (autoSummary) => {
      mocks.autoSummary = autoSummary;
      const view = render(<BatchTranscriptionRecovery />);
      await act(async () => {});
      expect(mocks.runBatch).not.toHaveBeenCalled();

      mocks.record = { id: "session-1" };
      view.rerender(<BatchTranscriptionRecovery />);
      await waitFor(() => expect(mocks.runBatch).toHaveBeenCalledOnce());
      expect(mocks.runBatch).toHaveBeenCalledWith("/tmp/recovery.wav", {
        promotion: { scope: "whole_session" },
        resume: { provider: "ollama", model: "local-stt" },
      });
      await act(async () => {});
      expect(mocks.queueSummary).toHaveBeenCalledTimes(autoSummary ? 1 : 0);
      view.rerender(<BatchTranscriptionRecovery />);
      expect(mocks.runBatch).toHaveBeenCalledOnce();
    },
  );

  it("resumes a persisted job once during StrictMode effect replay", async () => {
    mocks.record = { id: "session-1" };
    mocks.autoSummary = true;
    render(
      <StrictMode>
        <BatchTranscriptionRecovery />
      </StrictMode>,
    );
    await waitFor(() => expect(mocks.runBatch).toHaveBeenCalledOnce());
    await act(async () => {});
    expect(mocks.queueSummary).toHaveBeenCalledOnce();
  });

  it("keeps a failed recovered transcription out of the summary queue", async () => {
    mocks.record = { id: "session-1" };
    mocks.autoSummary = true;
    mocks.runBatch.mockRejectedValue(new Error("provider unavailable"));
    render(<BatchTranscriptionRecovery />);
    await waitFor(() =>
      expect(mocks.failed).toHaveBeenCalledWith(
        "session-1",
        "provider unavailable",
      ),
    );
    expect(mocks.queueSummary).not.toHaveBeenCalled();
  });
});
