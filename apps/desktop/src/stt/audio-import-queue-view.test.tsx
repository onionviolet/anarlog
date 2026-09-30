import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { useAudioImportQueue } from "./audio-import-queue";
import { AudioImportQueueView } from "./audio-import-queue-view";

const mocks = vi.hoisted(() => ({
  userId: "old",
  processFile: vi.fn(),
  missing: new Set<string>(),
}));

vi.mock("@lingui/react", () => ({ Trans: () => null }));
vi.mock("~/auth", () => ({
  useAuth: () => ({ session: { user: { id: mocks.userId } } }),
}));
vi.mock("~/session/queries", () => ({
  preloadSession: async (id: string) => (mocks.missing.has(id) ? null : { id }),
}));
vi.mock("~/store/zustand/tabs", () => ({
  useTabs: { getState: () => ({ openNew: vi.fn() }) },
}));
vi.mock("./contexts", () => ({
  useListener: (selector: (state: unknown) => unknown) =>
    selector({ batch: {} }),
}));
vi.mock("./useRunBatch", () => ({ isStoppedTranscriptionError: () => false }));
vi.mock("./useUploadFile", () => ({
  useUploadFile: () => ({
    processFile: mocks.processFile,
    processAudioFile: vi.fn(),
  }),
}));

beforeEach(() => {
  mocks.userId = "old";
  mocks.missing.clear();
  mocks.processFile.mockReset();
  useAudioImportQueue.setState({ jobs: [] });
});
afterEach(async () => {
  cleanup();
  await act(async () => {});
});

test("account changes cancel and hide old imports while allowing the next account to run after cancellation settles", async () => {
  let release!: () => void;
  let oldSignal!: AbortSignal;
  mocks.processFile.mockImplementation(
    async (source: string, _kind: string, options: { signal: AbortSignal }) => {
      if (source === "old.wav") {
        oldSignal = options.signal;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        options.signal.throwIfAborted();
      }
    },
  );
  useAudioImportQueue.getState().enqueue([
    { sessionId: "old-session", name: "old.wav", source: "old.wav" },
    {
      sessionId: "old-pending",
      name: "old-pending.wav",
      source: "old-pending.wav",
    },
  ]);
  const view = render(
    <StrictMode>
      <AudioImportQueueView />
    </StrictMode>,
    { wrapper: createWrapper() },
  );
  await waitFor(() =>
    expect(useAudioImportQueue.getState().jobs[0].status).toBe("running"),
  );
  expect(oldSignal.aborted).toBe(false);
  expect(screen.getByText("old.wav")).toBeTruthy();

  mocks.userId = "new";
  view.rerender(
    <StrictMode>
      <AudioImportQueueView />
    </StrictMode>,
  );
  expect(screen.queryByText("old.wav")).toBeNull();
  expect(screen.queryByText("old-pending.wav")).toBeNull();
  await waitFor(() => expect(oldSignal.aborted).toBe(true));
  act(() =>
    useAudioImportQueue
      .getState()
      .enqueue([
        { sessionId: "new-session", name: "new.wav", source: "new.wav" },
      ]),
  );
  await waitFor(() => expect(screen.getByText("new.wav")).toBeTruthy());
  expect(
    useAudioImportQueue
      .getState()
      .jobs.find((job) => job.sessionId === "new-session")?.status,
  ).toBe("pending");

  await act(async () => {
    release();
  });
  await waitFor(() =>
    expect(
      useAudioImportQueue
        .getState()
        .jobs.map((job) => [job.sessionId, job.status]),
    ).toEqual([["new-session", "completed"]]),
  );
  expect(mocks.processFile.mock.calls.map(([source]) => source)).toEqual([
    "old.wav",
    "new.wav",
  ]);
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

test("a deleted pending note fails visibly and the next audio file still completes", async () => {
  mocks.missing.add("deleted");
  mocks.processFile.mockResolvedValue(undefined);
  useAudioImportQueue.getState().enqueue([
    { sessionId: "deleted", name: "deleted.wav", source: "deleted.wav" },
    { sessionId: "next", name: "next.wav", source: "next.wav" },
  ]);
  render(<AudioImportQueueView />, { wrapper: createWrapper() });
  await waitFor(() =>
    expect(
      useAudioImportQueue.getState().jobs.map((job) => job.status),
    ).toEqual(["failed", "completed"]),
  );
  expect(
    screen.getByText(
      "The note was deleted before its audio could be imported.",
    ),
  ).toBeTruthy();
  expect(mocks.processFile.mock.calls.map(([source]) => source)).toEqual([
    "next.wav",
  ]);
});
