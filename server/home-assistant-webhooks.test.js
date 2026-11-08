import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  query: vi.fn(),
  log: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({ default: { lookup: mocks.lookup } }));
vi.mock("./db.js", () => ({ dbPool: { query: mocks.query } }));
vi.mock("./system-logs.js", () => ({ logSystemEvent: mocks.log }));

const {
  assertSafeHomeAssistantWebhookUrl,
  buildHomeAssistantWebhookPayload,
  emitHomeAssistantWebhookEventDetached,
  removeHomeAssistantWebhookDestination,
  upsertHomeAssistantWebhookDestination,
  waitForPendingWebhookDeliveries,
} = await import("./webhooks.js");

beforeEach(() => {
  mocks.lookup.mockReset().mockResolvedValue([{ address: "93.184.216.34" }]);
  mocks.query.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
  mocks.log.mockReset().mockResolvedValue(undefined);
  vi.unstubAllGlobals();
});

describe("Home Assistant webhook destinations", () => {
  it("registers and removes a destination independently by config entry", async () => {
    await upsertHomeAssistantWebhookDestination("user-1", {
      configEntryId: "ha-entry-1",
      webhookUrl: "https://ha.example.com/api/webhook/secret",
      includeBody: false,
    });
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("home_assistant_webhook_destinations"),
      [expect.any(String), "user-1", "ha-entry-1", "https://ha.example.com/api/webhook/secret", false],
    );

    mocks.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await expect(removeHomeAssistantWebhookDestination("user-1", "ha-entry-1")).resolves.toBe(true);
    expect(mocks.query).toHaveBeenLastCalledWith(
      expect.stringContaining("delete from home_assistant_webhook_destinations"),
      ["user-1", "ha-entry-1"],
    );
  });

  it("rejects private and non-HTTPS destinations", async () => {
    mocks.lookup.mockResolvedValueOnce([{ address: "169.254.169.254" }]);
    await expect(assertSafeHomeAssistantWebhookUrl("https://metadata.example/api/webhook/x"))
      .rejects.toMatchObject({ status: 400 });
    await expect(assertSafeHomeAssistantWebhookUrl("http://ha.example.com/api/webhook/x"))
      .rejects.toMatchObject({ status: 400 });
  });

  it("preserves the HA event payload while filtering secrets and optional body content", () => {
    const payload = buildHomeAssistantWebhookPayload(eventPayload(), true);
    expect(payload.email.body).toEqual({ text: "plain text" });
    expect(payload.email.attachments[0].content_base64).toBeUndefined();
    expect(payload.email.headers).toBeUndefined();
    expect(payload.activity_callback).toBeUndefined();

    expect(buildHomeAssistantWebhookPayload(eventPayload(), false).email.body).toBeUndefined();
  });

  it("attempts delivery once and does not surface a destination failure", async () => {
    mocks.query.mockImplementation(async (sql) => {
      if (String(sql).includes("select config_entry_id")) {
        return {
          rows: [{
            configEntryId: "ha-entry-1",
            webhookUrl: "https://ha.example.com/api/webhook/secret",
            includeBody: false,
          }],
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);

    emitHomeAssistantWebhookEventDetached(
      "user-1",
      "email.ready_for_processing",
      eventPayload(),
      { eventId: "evt-1" },
    );
    await waitForPendingWebhookDeliveries();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.log).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ status: "error" }),
    );
  });

  it("delivers independently to multiple Home Assistant entries", async () => {
    mocks.query.mockImplementation(async (sql) => {
      if (String(sql).includes("select config_entry_id")) {
        return {
          rows: [
            {
              configEntryId: "ha-entry-1",
              webhookUrl: "https://one.example.com/api/webhook/secret-1",
              includeBody: false,
            },
            {
              configEntryId: "ha-entry-2",
              webhookUrl: "https://two.example.com/api/webhook/secret-2",
              includeBody: true,
            },
          ],
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    emitHomeAssistantWebhookEventDetached(
      "user-1",
      "email.ready_for_processing",
      eventPayload(),
      { eventId: "evt-shared" },
    );
    await waitForPendingWebhookDeliveries();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requests = Object.fromEntries(fetchMock.mock.calls.map(([url, options]) => [
      url,
      JSON.parse(options.body),
    ]));
    expect(requests["https://one.example.com/api/webhook/secret-1"].event_id).toBe("evt-shared");
    expect(requests["https://one.example.com/api/webhook/secret-1"].payload.email.body).toBeUndefined();
    expect(requests["https://two.example.com/api/webhook/secret-2"].payload.email.body).toEqual({ text: "plain text" });
  });
});

function eventPayload() {
  return {
    email: {
      id: "email-1",
      thread_id: "thread-1",
      account_id: "account-1",
      account_email: "owner@example.com",
      provider: "gmail",
      from: { email: "sender@example.com", name: "Sender" },
      subject: "Subject",
      received_at: "2026-11-08T12:00:00Z",
      body: { text: "plain text", html: "<p>secret html</p>" },
      headers: { authorization: "secret" },
      attachments: [{ filename: "note.txt", content_base64: "c2VjcmV0" }],
    },
    classification: { labels: [{ name: "General" }], attention: null },
    activity_callback: { url: "https://secret.example/callback" },
  };
}
