import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import WaveSurfer from "wavesurfer.js";

import { commands as fsSyncCommands } from "@anlg/plugin-fs-sync";

import { configureCenteredPlayback } from "./playback";
import { SelectionLoop } from "./selection-loop";
import { loadWaveform } from "./waveform";

import { useFeatureAccess } from "~/auth/local-entitlements";
import {
  isSessionAudioIdle,
  subscribeToSessionAudioRetention,
} from "~/services/audio-retention";
import { deleteSessionAudio } from "~/session/attachments";
import { useMountEffect } from "~/shared/hooks/useMountEffect";

const TIME_UPDATE_STEP_SECONDS = 0.1;

type AudioPlayerState = "playing" | "paused" | "stopped";

interface TimeSnapshot {
  current: number;
  total: number;
}

class TimeStore {
  private snapshot: TimeSnapshot = { current: 0, total: 0 };
  private listeners = new Set<() => void>();

  getSnapshot = (): TimeSnapshot => {
    return this.snapshot;
  };

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  setCurrent(value: number) {
    if (value === this.snapshot.current) return;
    this.snapshot = { ...this.snapshot, current: value };
    this.notify();
  }

  setTotal(value: number) {
    if (value === this.snapshot.total) return;
    this.snapshot = { ...this.snapshot, total: value };
    this.notify();
  }

  reset() {
    this.snapshot = { current: 0, total: 0 };
    this.notify();
  }

  private notify() {
    for (const cb of this.listeners) {
      cb();
    }
  }
}

interface AudioPlayerContextValue {
  registerContainer: (el: HTMLDivElement | null) => void;
  wavesurfer: WaveSurfer | null;
  state: AudioPlayerState;
  timeStore: TimeStore;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  seek: (sec: number) => void;
  loopSelection: (start: number, end: number) => void;
  clearLoop: () => void;
  looping: boolean;
  audioExists: boolean;
  audioExistsResolved: boolean;
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
  deleteRecording: () => Promise<void>;
  isDeletingRecording: boolean;
}

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error("useAudioPlayer must be used within AudioPlayerProvider");
  }
  return context;
}

export function useAudioTime(): TimeSnapshot {
  const { timeStore } = useAudioPlayer();
  return useSyncExternalStore(timeStore.subscribe, timeStore.getSnapshot);
}

function useAudioExistence(sessionId: string) {
  const audioExists = useQuery({
    queryKey: ["audio", sessionId, "exist"],
    queryFn: () => fsSyncCommands.audioExist(sessionId),
    select: (result) => {
      if (result.status === "error") {
        throw new Error(result.error);
      }
      return result.data;
    },
  });

  return {
    audioExists: audioExists.data ?? false,
    audioExistsResolved: audioExists.isSuccess,
  };
}

export function useAudioExists(sessionId: string): boolean {
  return useAudioExistence(sessionId).audioExists;
}

export function AudioPlayerProvider({
  sessionId,
  url,
  children,
}: {
  sessionId: string;
  url: string;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const playbackSpeedAllowed = useFeatureAccess("playbackSpeed");
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [wavesurfer, setWavesurfer] = useState<WaveSurfer | null>(null);
  const [state, setState] = useState<AudioPlayerState>("stopped");
  const [playbackRate, setPlaybackRateState] = useState(1);
  const timeStoreRef = useRef(new TimeStore());
  const loopRef = useRef(new SelectionLoop());
  const [looping, setLooping] = useState(false);
  const clearLoop = useCallback(() => {
    loopRef.current.clear();
    setLooping(false);
  }, []);
  const stopRequestedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const { audioExists: audioExistsValue, audioExistsResolved } =
    useAudioExistence(sessionId);

  const registerContainer = useCallback((el: HTMLDivElement | null) => {
    setContainer((prev) => (prev === el ? prev : el));
  }, []);

  useEffect(() => {
    clearLoop();
    if (!container || !url) {
      return;
    }

    const store = timeStoreRef.current;
    store.reset();
    stopRequestedRef.current = false;

    let lastReportedTime = 0;

    const media = new Audio();
    media.crossOrigin = "anonymous";
    media.preload = "metadata";

    const ws = WaveSurfer.create({
      container,
      media,
      height: 24,
      waveColor: "#e5e5e5",
      progressColor: "#a8a8a8",
      cursorColor: "#737373",
      cursorWidth: 2,
      barWidth: 3,
      barGap: 2,
      barRadius: 2,
      barHeight: 1,
      dragToSeek: true,
      normalize: true,
      splitChannels: [
        { waveColor: "#e8d5d5", progressColor: "#c9a3a3", overlay: true },
        { waveColor: "#d5dde8", progressColor: "#a3b3c9", overlay: true },
      ],
    });
    const audioContext = configureCenteredPlayback(media);
    audioContextRef.current = audioContext;

    const syncCurrentTime = (currentTime: number, force = false) => {
      if (
        !force &&
        Math.abs(currentTime - lastReportedTime) < TIME_UPDATE_STEP_SECONDS
      ) {
        return;
      }

      lastReportedTime = currentTime;
      store.setCurrent(currentTime);
    };

    const handleReady = (dur: number) => {
      if (dur && isFinite(dur)) {
        store.setTotal(dur);
      }
    };

    const handlePlay = () => {
      stopRequestedRef.current = false;
      syncCurrentTime(ws.getCurrentTime(), true);
      setState("playing");
    };

    const handlePause = () => {
      const currentTime = ws.getCurrentTime();
      syncCurrentTime(currentTime, true);

      if (stopRequestedRef.current) {
        stopRequestedRef.current = false;
        setState("stopped");
        return;
      }

      setState("paused");
    };

    const handleFinish = () => {
      const restart = loopRef.current.restartAt(ws.getDuration());
      if (restart !== null) {
        ws.setTime(restart);
        void ws.play().catch(() => clearLoop());
        return;
      }
      stopRequestedRef.current = false;
      syncCurrentTime(ws.getDuration(), true);
      setState("stopped");
    };

    const handleTimeupdate = (currentTime: number) => {
      const restart = ws.isPlaying()
        ? loopRef.current.restartAt(currentTime)
        : null;
      if (restart !== null) {
        ws.setTime(restart);
        syncCurrentTime(restart, true);
        return;
      }
      syncCurrentTime(currentTime);
    };

    const handleInteraction = (currentTime: number) => {
      clearLoop();
      syncCurrentTime(currentTime, true);
    };

    const handleDecode = (dur: number) => {
      if (dur && isFinite(dur)) {
        store.setTotal(dur);
      }
    };

    const handleDestroy = () => {
      stopRequestedRef.current = false;
      setState("stopped");
    };

    ws.on("decode", handleDecode);
    ws.on("play", handlePlay);
    ws.on("pause", handlePause);
    ws.on("finish", handleFinish);
    ws.on("ready", handleReady);
    ws.on("timeupdate", handleTimeupdate);
    ws.on("interaction", handleInteraction);
    ws.on("destroy", handleDestroy);

    setWavesurfer(ws);

    const loadController = new AbortController();
    void loadWaveform(ws, {
      url,
      sessionId,
      signal: loadController.signal,
    }).catch(() => {});

    return () => {
      loadController.abort();
      loopRef.current.clear();
      stopRequestedRef.current = false;
      if (audioContextRef.current === audioContext) {
        audioContextRef.current = null;
      }
      const mediaSrc = media.currentSrc || media.src;
      media.pause();
      ws.destroy();
      if (mediaSrc.startsWith("blob:")) {
        URL.revokeObjectURL(mediaSrc);
      }
      media.removeAttribute("src");
      media.load();
      setWavesurfer(null);
      void audioContext?.close();
    };
  }, [clearLoop, container, sessionId, url]);

  const play = useCallback(() => {
    if (!wavesurfer) {
      return;
    }

    const audioContext = audioContextRef.current;
    if (audioContext?.state === "suspended") {
      void audioContext
        .resume()
        .then(() => {
          if (audioContextRef.current === audioContext) {
            return wavesurfer.play();
          }
        })
        .catch(clearLoop);
      return;
    }

    void wavesurfer.play().catch(clearLoop);
  }, [clearLoop, wavesurfer]);

  const pause = useCallback(() => {
    clearLoop();
    if (wavesurfer) {
      wavesurfer.pause();
    }
  }, [clearLoop, wavesurfer]);

  const stop = useCallback(() => {
    clearLoop();
    if (wavesurfer) {
      const wasPlaying = wavesurfer.isPlaying();
      stopRequestedRef.current = wasPlaying;
      wavesurfer.stop();
      timeStoreRef.current.setCurrent(0);
      if (!wasPlaying) {
        setState("stopped");
      }
    }
  }, [clearLoop, wavesurfer]);

  const loopSelection = useCallback(
    (start: number, end: number) => {
      if (!wavesurfer || !audioExistsValue) return;
      if (!loopRef.current.select(start, end, wavesurfer.getDuration())) {
        setLooping(false);
        return;
      }
      setLooping(true);
      wavesurfer.setTime(Math.max(0, start));
      play();
    },
    [audioExistsValue, play, wavesurfer],
  );

  const markAudioDeleted = useCallback(() => {
    timeStoreRef.current.reset();
    queryClient.setQueryData(["audio", sessionId, "exist"], {
      status: "ok",
      data: false,
    });
    queryClient.setQueryData(["audio", sessionId, "url"], {
      status: "error",
      error: "audio_path_not_found",
    });
    void queryClient.invalidateQueries({
      queryKey: ["audio", sessionId, "exist"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["audio", sessionId, "url"],
    });
  }, [queryClient, sessionId]);
  const retentionHandlerRef = useRef(
    (_event: { phase: "deleting" | "deleted"; sessionId: string }) => {},
  );
  retentionHandlerRef.current = (event) => {
    if (event.sessionId !== sessionId) {
      return;
    }
    stop();
    if (event.phase === "deleted") {
      markAudioDeleted();
    }
  };
  useMountEffect(() =>
    subscribeToSessionAudioRetention((event) =>
      retentionHandlerRef.current(event),
    ),
  );

  const seek = useCallback(
    (timeInSeconds: number) => {
      clearLoop();
      if (wavesurfer) {
        wavesurfer.setTime(timeInSeconds);
      }
    },
    [clearLoop, wavesurfer],
  );

  const setPlaybackRate = useCallback(
    (rate: number) => {
      if (!playbackSpeedAllowed && rate !== 1) {
        return;
      }
      if (wavesurfer) {
        wavesurfer.setPlaybackRate(rate, false);
      }
      setPlaybackRateState(rate);
    },
    [playbackSpeedAllowed, wavesurfer],
  );

  useEffect(() => {
    if (!wavesurfer) {
      return;
    }

    const nextRate = playbackSpeedAllowed ? playbackRate : 1;
    wavesurfer.setPlaybackRate(nextRate, false);

    if (nextRate !== playbackRate) {
      setPlaybackRateState(1);
    }
  }, [playbackSpeedAllowed, playbackRate, wavesurfer]);

  const deleteRecordingMutation = useMutation({
    mutationFn: async () => {
      stop();
      const deleted = await deleteSessionAudio(sessionId, () =>
        isSessionAudioIdle(sessionId),
      );
      if (!deleted) {
        throw new Error("audio_session_busy");
      }
    },
    onSuccess: markAudioDeleted,
  });

  const value = useMemo<AudioPlayerContextValue>(
    () => ({
      registerContainer,
      wavesurfer,
      state,
      timeStore: timeStoreRef.current,
      start: play,
      pause,
      resume: play,
      stop,
      seek,
      loopSelection,
      clearLoop,
      looping,
      audioExists: audioExistsValue,
      audioExistsResolved,
      playbackRate,
      setPlaybackRate,
      deleteRecording: deleteRecordingMutation.mutateAsync,
      isDeletingRecording: deleteRecordingMutation.isPending,
    }),
    [
      registerContainer,
      wavesurfer,
      state,
      play,
      pause,
      stop,
      seek,
      loopSelection,
      clearLoop,
      looping,
      audioExistsValue,
      audioExistsResolved,
      playbackRate,
      setPlaybackRate,
      deleteRecordingMutation.mutateAsync,
      deleteRecordingMutation.isPending,
    ],
  );

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
    </AudioPlayerContext.Provider>
  );
}
