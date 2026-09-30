import { beforeEach, expect, test } from "vitest";

import { useAudioImportQueue } from "./audio-import-queue";

beforeEach(() => useAudioImportQueue.setState({ jobs: [] }));

test("cancelled active imports settle before later files run, and failures leave later files available", async () => {
  const queue = useAudioImportQueue.getState();
  queue.enqueue(
    ["one", "two", "three", "four"].map((name) => ({
      sessionId: name,
      name,
      source: `${name}.wav`,
    })),
  );
  const [one, two, three, four] = useAudioImportQueue.getState().jobs;
  let release!: () => void;
  const active = queue.run(one.id, async (signal) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    signal.throwIfAborted();
  });
  queue.cancel(one.id);
  queue.cancel(two.id);
  let nextRan = false;
  await queue.run(three.id, async () => {
    nextRan = true;
  });
  expect(nextRan).toBe(false);
  release();
  await active;
  await queue.run(three.id, async () => {
    throw new Error("Unsupported audio");
  });
  await queue.run(four.id, async () => {
    nextRan = true;
  });
  expect(nextRan).toBe(true);
  expect(
    useAudioImportQueue.getState().jobs.map(({ status }) => status),
  ).toEqual(["cancelled", "cancelled", "failed", "completed"]);
  expect(useAudioImportQueue.getState().jobs[2].error).toBe(
    "Unsupported audio",
  );
});

test("abandoning an account hides its queue and blocks new imports until cancellation settles", async () => {
  const queue = useAudioImportQueue.getState();
  queue.enqueue([
    { sessionId: "old", name: "old.wav", source: "old.wav" },
    { sessionId: "pending", name: "pending.wav", source: "pending.wav" },
  ]);
  let release!: () => void;
  const active = queue.run(
    useAudioImportQueue.getState().jobs[0].id,
    async (signal) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      signal.throwIfAborted();
    },
  );
  queue.abandon();
  queue.enqueue([{ sessionId: "new", name: "new.wav", source: "new.wav" }]);
  const jobs = useAudioImportQueue.getState().jobs;
  expect(
    jobs.filter((job) => !job.abandoned).map((job) => job.sessionId),
  ).toEqual(["new"]);
  let newImportCompleted = false;
  await queue.run(jobs[1].id, async () => {
    newImportCompleted = true;
  });
  expect(newImportCompleted).toBe(false);
  release();
  await active;
  await queue.run(jobs[1].id, async () => {
    newImportCompleted = true;
  });
  expect(newImportCompleted).toBe(true);
  expect(
    useAudioImportQueue.getState().jobs.map((job) => job.sessionId),
  ).toEqual(["new"]);
});
