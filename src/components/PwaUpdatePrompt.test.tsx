// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PwaUpdatePrompt, type PwaUpdatePromptProps } from "./PwaUpdatePrompt";

afterEach(cleanup);

const baseProps: PwaUpdatePromptProps = {
  applyUpdate: vi.fn().mockResolvedValue(undefined),
  collapseUpdate: vi.fn(),
  expandUpdate: vi.fn(),
  isOffline: false,
  isUpdateAvailable: true,
  isUpdateCollapsed: false,
  isUpdating: false,
};

describe("PwaUpdatePrompt", () => {
  it("stays above the floating action bar and collapses for later", () => {
    const collapseUpdate = vi.fn();
    const { container } = render(<PwaUpdatePrompt {...baseProps} collapseUpdate={collapseUpdate} />);
    expect(container.querySelector(".z-\\[1000\\]")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(collapseUpdate).toHaveBeenCalledOnce();
  });

  it("renders a restorable notification bubble when collapsed", () => {
    const expandUpdate = vi.fn();
    render(<PwaUpdatePrompt {...baseProps} expandUpdate={expandUpdate} isUpdateCollapsed />);
    fireEvent.click(screen.getByRole("button", { name: "Show available update" }));
    expect(expandUpdate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Reload" })).toBeNull();
  });
});
