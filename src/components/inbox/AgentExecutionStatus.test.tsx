// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AgentExecutionStatus } from "./AgentExecutionStatus";

afterEach(cleanup);

describe("AgentExecutionStatus", () => {
  it("summarizes real events and exposes expandable completed and failed steps", () => {
    render(<AgentExecutionStatus events={[
      { callId: "one", phase: "completed", toolName: "search_web" },
      { callId: "two", error: "Service unavailable", phase: "failed", toolName: "calendar_lookup" },
    ]} isRunning={false} />);
    expect(screen.getByText("Checking the calendar failed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /checking the calendar failed/i }));
    expect(screen.getByText("Searching the web completed")).toBeTruthy();
    expect(screen.getByText("Service unavailable")).toBeTruthy();
  });
});
