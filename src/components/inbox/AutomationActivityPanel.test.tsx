// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutomationActivityPanel } from "./AutomationActivityPanel";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("AutomationActivityPanel", () => {
  it("shows a completed externally reported outcome and provenance", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<AutomationActivityPanel accountId="account-1" emailId="email-1" initialActivities={[{
      id: "row-1", eventId: "event-1", activityId: "run-1", source: "Home Assistant", status: "completed", title: "Calendar event created", description: "Appointment added", reportedAt: "2026-11-07T18:14:05.000Z", receivedAt: "2026-11-07T18:14:06.000Z", reportedByExternalSystem: true,
    }]} />);
    expect(screen.getByText("Automation Activity")).toBeTruthy();
    expect(screen.getByText("Calendar event created")).toBeTruthy();
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.getByText(/does not independently verify/)).toBeTruthy();
  });

  it("shows a failed outcome without lifecycle placeholders", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<AutomationActivityPanel accountId="account-1" emailId="email-1" initialActivities={[{
      id: "row-2", eventId: "event-1", activityId: "run-2", source: "n8n", status: "failed", title: "Document failed", description: "Could not save", reportedAt: "2026-11-07T18:14:05.000Z", receivedAt: "2026-11-07T18:14:06.000Z", data: {}, error: { message: "Authentication expired" },
    }]} />);
    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getByText("Authentication expired")).toBeTruthy();
    expect(screen.queryByText(/unknown/i)).toBeNull();
  });
});
