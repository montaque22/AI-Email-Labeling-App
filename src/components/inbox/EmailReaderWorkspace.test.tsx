// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailReaderWorkspace } from "./EmailReaderWorkspace";

afterEach(cleanup);

describe("EmailReaderWorkspace", () => {
  it("shows the reading pane by default and requests Work mode", () => {
    const onModeChange = vi.fn();
    render(<EmailReaderWorkspace mode="read" onModeChange={onModeChange} readPane={<p>Full email</p>} workPane={<p>AI workspace</p>} />);
    expect(screen.getByText("Full email")).toBeTruthy();
    expect(screen.queryByText("AI workspace")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /work/i }));
    expect(onModeChange).toHaveBeenCalledWith("work");
  });

  it("keeps the email mounted beside the agent in Work mode", () => {
    render(<EmailReaderWorkspace mode="work" onModeChange={vi.fn()} readPane={<p>Full email</p>} workPane={<p>AI workspace</p>} />);
    expect(screen.getByText("Full email")).toBeTruthy();
    expect(screen.getByText("AI workspace")).toBeTruthy();
    expect(screen.getByRole("button", { name: /work/i }).getAttribute("aria-pressed")).toBe("true");
  });
});
