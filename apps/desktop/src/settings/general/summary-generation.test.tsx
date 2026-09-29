import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enabled: true,
  setEnabled: vi.fn(),
}));

vi.mock("~/shared/config", () => ({
  useConfigValue: () => mocks.enabled,
}));

vi.mock("~/settings/queries", () => ({
  useSetSettingValue: () => mocks.setEnabled,
}));

import { AutomaticSummarySetting } from "./summary-generation";

describe("AutomaticSummarySetting", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.enabled = true;
  });

  it("turns automatic summaries off while keeping on-demand generation", () => {
    render(<AutomaticSummarySetting />);

    const toggle = screen.getByRole("switch", {
      name: "Generate summaries automatically",
    });
    expect(toggle.getAttribute("data-state")).toBe("checked");
    expect(screen.getByText(/Generate a summary when you choose/)).toBeTruthy();

    fireEvent.click(toggle);

    expect(mocks.setEnabled).toHaveBeenCalledWith(false);
  });
});
