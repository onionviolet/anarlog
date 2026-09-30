import { create } from "zustand";

export type AudioImportJob = {
  id: string;
  sessionId: string;
  name: string;
  source: string | File;
  options?: {
    allowUnknownAudio?: boolean;
    contentType?: string;
    provider?: string;
    model?: string;
    baseUrl?: string;
    apiKey?: string;
  };
  status:
    | "pending"
    | "running"
    | "cancelling"
    | "completed"
    | "failed"
    | "cancelled";
  error?: string;
  abandoned?: boolean;
};

export const useAudioImportQueue = create<{
  jobs: AudioImportJob[];
  generation: number;
  enqueue: (jobs: Omit<AudioImportJob, "id" | "status">[]) => void;
  run: (
    id: string,
    work: (signal: AbortSignal) => Promise<void>,
  ) => Promise<void>;
  cancel: (id: string) => void;
  dismiss: () => void;
  abandon: () => void;
}>((set, get) => {
  const controllers = new Map<string, AbortController>();
  const update = (id: string, changes: Partial<AudioImportJob>) =>
    set((state) => ({
      jobs: state.jobs.map((job) =>
        job.id === id ? { ...job, ...changes } : job,
      ),
    }));
  return {
    jobs: [],
    generation: 0,
    enqueue: (jobs) =>
      set((state) => ({
        jobs: [
          ...state.jobs,
          ...jobs.map((job) => ({
            ...job,
            id: crypto.randomUUID(),
            status: "pending" as const,
          })),
        ],
      })),
    run: async (id, work) => {
      const jobs = get().jobs;
      if (
        jobs.some(
          (job) => job.status === "running" || job.status === "cancelling",
        ) ||
        jobs.find((job) => job.status === "pending")?.id !== id
      )
        return;
      const controller = new AbortController();
      controllers.set(id, controller);
      update(id, { status: "running" });
      try {
        await work(controller.signal);
        update(id, {
          status: controller.signal.aborted ? "cancelled" : "completed",
        });
      } catch (error) {
        update(id, {
          status: controller.signal.aborted ? "cancelled" : "failed",
          error: controller.signal.aborted
            ? undefined
            : error instanceof Error
              ? error.message
              : String(error),
        });
      } finally {
        controllers.delete(id);
        set((state) => ({
          jobs: state.jobs.filter((job) => !(job.id === id && job.abandoned)),
        }));
      }
    },
    cancel: (id) => {
      const job = get().jobs.find((job) => job.id === id);
      if (job?.status === "pending") update(id, { status: "cancelled" });
      else if (job?.status === "running") {
        update(id, { status: "cancelling" });
        controllers.get(id)?.abort();
      }
    },
    abandon: () => {
      set((state) => ({ generation: state.generation + 1 }));
      const jobs = get().jobs;
      for (const job of jobs) get().cancel(job.id);
      set((state) => ({
        jobs: state.jobs
          .filter((job) => job.status === "cancelling")
          .map((job) => ({ ...job, abandoned: true })),
      }));
    },
    dismiss: () =>
      set((state) => ({
        jobs: state.jobs.filter((job) =>
          ["pending", "running", "cancelling"].includes(job.status),
        ),
      })),
  };
});
