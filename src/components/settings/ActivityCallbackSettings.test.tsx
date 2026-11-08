// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ACTIVITY_CALLBACK_EXAMPLES } from "../../../shared/webhook-contracts.js";
import { ActivityCallbackSettings } from "./ActivityCallbackSettings";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("ActivityCallbackSettings", () => {
  it("shows the terminal outcome examples and copies the selected JSON", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ enabled: true, callbackUrl: "https://example.com/api/v1/activity-callbacks/secret", maskedCallbackUrl: "https://example.com/api/v1/activity-callbacks/secret••••", usage: 1, dailyLimit: 500, ratePerSecond: 5, burstLimit: 10 }) }));
    render(<ActivityCallbackSettings />);
    expect(await screen.findByText("Callback protocol v1.0")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy URL" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://example.com/api/v1/activity-callbacks/secret"));
    fireEvent.click(screen.getByRole("tab", { name: "Completed" }));
    expect(screen.getByText(/Document created/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy completed JSON" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(JSON.stringify(ACTIVITY_CALLBACK_EXAMPLES.completed, null, 2)));
  });

  it("keeps rotation behind an explicit warning", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ enabled: true, callbackUrl: "https://example.com/secret", maskedCallbackUrl: "https://example.com/sec••••", usage: 0, dailyLimit: 500, ratePerSecond: 5, burstLimit: 10 }) }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ActivityCallbackSettings />);
    fireEvent.click(await screen.findByRole("button", { name: /Rotate URL/ }));
    expect(confirm).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
