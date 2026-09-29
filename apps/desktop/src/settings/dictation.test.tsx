import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listMicrophoneDevices: vi.fn(),
  setSettingValue: vi.fn(),
}));

vi.mock("@anlg/plugin-transcription", () => ({
  commands: { listMicrophoneDevices: mocks.listMicrophoneDevices },
}));

vi.mock("@tauri-apps/plugin-os", () => ({ platform: () => "macos" }));

vi.mock("~/dictation/state", () => ({
  useDictationStatus: (selector: (state: object) => unknown) =>
    selector({
      phase: "idle",
      error: null,
      ready: false,
      retry: 0,
      cancel: null,
      lastTranscript: "",
    }),
}));

vi.mock("~/settings/queries", () => ({
  useSetSettingValue: (key: string) => (value: unknown) =>
    mocks.setSettingValue(key, value),
}));

vi.mock("~/shared/config", () => ({
  useConfigValue: (key: string) =>
    ({
      dictation_enabled: false,
      dictation_shortcut: "Control+Alt+Space",
      dictation_hands_free: false,
      dictation_live_preview: false,
      microphone_device: "",
    })[key],
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: (selector: (state: object) => unknown) =>
    selector({ openNew: vi.fn() }),
}));

vi.mock("./dictation-shortcut", () => ({
  DictationShortcut: () => <span>Dictation shortcut</span>,
}));

import { SettingsDictation } from "./dictation";

describe("SettingsDictation", () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("allows local dictation and microphone selection", async () => {
    mocks.listMicrophoneDevices.mockResolvedValue({
      status: "ok",
      data: ["Built-in Microphone"],
    });

    render(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false } },
          })
        }
      >
        <SettingsDictation />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(mocks.listMicrophoneDevices).toHaveBeenCalledOnce(),
    );
    expect(
      (
        await screen.findByRole("switch", { name: "Enable dictation" })
      ).getAttribute("disabled"),
    ).toBeNull();

    fireEvent.click(screen.getByRole("switch", { name: "Enable dictation" }));
    expect(mocks.setSettingValue).toHaveBeenCalledWith(
      "dictation_enabled",
      true,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Microphone" }));
    expect(await screen.findByText("Built-in Microphone")).toBeTruthy();
  });
});
