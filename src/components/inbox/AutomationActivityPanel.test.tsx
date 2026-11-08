// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutomationActivityPanel } from "./AutomationActivityPanel";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("AutomationActivityPanel", () => {
  it("shows externally reported status, duration, and provenance", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<AutomationActivityPanel accountId="account-1" emailId="email-1" initialActivities={[{
      id: "row-1", eventId: "event-1", activityId: "run-1", source: "Home Assistant", status: "completed", title: "Calendar event created", description: "Appointment added", durationMs: 3000, reportedStartedAt: "2026-11-07T18:14:02.000Z", reportedByExternalSystem: true,
    }]} />);
    expect(screen.getByText("Automation Activity")).toBeTruthy();
    expect(screen.getByText("Calendar event created")).toBeTruthy();
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.getByText(/3s/)).toBeTruthy();
    expect(screen.getByText(/does not independently verify/)).toBeTruthy();
  });

  it("labels incomplete lifecycle timing without inventing a duration", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<AutomationActivityPanel accountId="account-1" emailId="email-1" initialActivities={[{
      id: "row-2", eventId: "event-1", activityId: "run-2", source: "n8n", status: "completed", title: "Document created", description: "Saved", reportedEndedAt: "2026-11-07T18:14:05.000Z", data: {},
    }]} />);
    expect(screen.getByText(/Start unknown/)).toBeTruthy();
  });
});
