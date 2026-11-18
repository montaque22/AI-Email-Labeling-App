// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PushNotificationSettings, urlBase64ToUint8Array } from "./PushNotificationSettings";

describe("PushNotificationSettings", () => {
  it("explains when Web Push is unavailable instead of presenting a broken enable button", async () => {
    render(<PushNotificationSettings />);

    await waitFor(() => expect(screen.getByText("Not supported in this environment")).toBeTruthy());
    expect(screen.getByRole("button", { name: /Enable notifications/i })).toHaveProperty("disabled", true);
  });

  it("decodes URL-safe VAPID public keys for PushManager", () => {
    expect([...urlBase64ToUint8Array("AQIDBA")]).toEqual([1, 2, 3, 4]);
  });
});
