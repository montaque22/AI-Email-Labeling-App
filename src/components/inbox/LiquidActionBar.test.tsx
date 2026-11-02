// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiquidActionBar } from "./LiquidActionBar";

const baseProps = {
  isAiAvailable: true,
  onArchive: vi.fn(),
  onClearSelection: vi.fn(),
  onCompose: vi.fn(),
  onOpenAi: vi.fn(),
  onTrash: vi.fn(),
  selectedCount: 0,
};

describe("LiquidActionBar", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("starts as one orb and reveals general actions", () => {
    render(<LiquidActionBar {...baseProps} />);
    expect(screen.queryByRole("button", { name: "Compose email" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open inbox actions" }));
    expect(screen.getByRole("button", { name: "Open AI Assistant" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Compose email" })).toBeTruthy();
  });

  it("auto-expands for selection and invokes existing bulk handlers", () => {
    const { rerender } = render(<LiquidActionBar {...baseProps} />);
    rerender(<LiquidActionBar {...baseProps} selectedCount={3} />);
    expect(screen.getByText("3 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Archive selected emails" }));
    fireEvent.click(screen.getByRole("button", { name: "Move selected emails to Trash" }));
    expect(baseProps.onArchive).toHaveBeenCalledOnce();
    expect(baseProps.onTrash).toHaveBeenCalledOnce();
  });

  it("collapses without clearing selection and retains a count badge", () => {
    render(<LiquidActionBar {...baseProps} selectedCount={4} />);
    fireEvent.click(screen.getByRole("button", { name: "Collapse actions" }));
    expect(baseProps.onClearSelection).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Open actions for 4 selected emails" })).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
  });

  it("collapses when launching AI or Compose", () => {
    render(<LiquidActionBar {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Open inbox actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Open AI Assistant" }));
    expect(baseProps.onOpenAi).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Open inbox actions" })).toBeTruthy();
  });
});
