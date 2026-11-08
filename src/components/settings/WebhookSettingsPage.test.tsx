// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WEBHOOK_EVENT_DEFINITIONS, createWebhookEnvelope } from "../../../shared/webhook-contracts.js";
import { WebhookSettingsPage } from "./WebhookSettingsPage";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("WebhookSettingsPage", () => {
  it("distinguishes both integration directions and copies outbound examples", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => ({ ok: true, json: async () => String(input).includes("activity-callback") ? ({ enabled: true, callbackUrl: "https://example.com/callback", maskedCallbackUrl: "https://example.com/call••••", usage: 0, dailyLimit: 500, ratePerSecond: 5, burstLimit: 10 }) : ({ webhookUrl: "", bearerToken: "" }) })));
    render(<WebhookSettingsPage />);
    expect(await screen.findByText("Outbound Webhooks")).toBeTruthy();
    expect(screen.getByText("Activity Callbacks")).toBeTruthy();
    const definition = WEBHOOK_EVENT_DEFINITIONS.find((event) => event.name === "email.ready_for_processing")!;
    fireEvent.click(screen.getByRole("button", { name: "Copy email.ready_for_processing JSON" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(JSON.stringify(createWebhookEnvelope(definition.name, definition.payload), null, 2)));
  });
});
