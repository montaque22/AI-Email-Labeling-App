import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./db.js", () => ({ dbPool: { query: mocks.query } }));
vi.mock("./session.js", () => ({ requireSession: (_req, _res, next) => next() }));
vi.mock("./webhooks.js", () => ({ emitWebhookEventDetached: vi.fn() }));
vi.mock("./system-logs.js", () => ({ logSystemEvent: vi.fn() }));

const {
  buildEventFeedPayload,
  listIntegrationEvents,
  maybePruneExpiredPostProcessingEvents,
} = await import("./automation-activity.js");

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const thirdId = "33333333-3333-4333-8333-333333333333";

beforeEach(() => mocks.query.mockReset());

describe("integration event feed", () => {
  it("initializes at latest, pages in stable order, and binds cursors to a user", async () => {
    mocks.query.mockImplementation(async (sql) => {
      const text = String(sql ?? "");
      if (!text) return { rows: [] };
      if (text.startsWith("delete from post_processing_events") || text.startsWith("update post_processing_events set payload=null")) return { rows: [] };
      if (text.includes("order by created_at desc,id desc")) return { rows: [{ id: firstId, created_at: "2026-11-07T18:00:00Z" }] };
      if (text.includes("order by created_at,id limit 1")) return { rows: [{ id: firstId, created_at: "2026-11-07T18:00:00Z" }] };
      if (text.includes("select id,event_id,created_at,payload")) return { rows: [
        { id: secondId, event_id: "evt-2", created_at: "2026-11-07T18:01:00Z", payload: eventPayload("Second") },
        { id: thirdId, event_id: "evt-3", created_at: "2026-11-07T18:02:00Z", payload: eventPayload("Third") },
      ] };
      throw new Error(`Unexpected query: ${text}`);
    });

    const initialized = await listIntegrationEvents("user-alpha", { cursor: "latest" });
    expect(initialized.events).toEqual([]);
    expect(initialized.next_cursor).toEqual(expect.any(String));

    const page = await listIntegrationEvents("user-alpha", { cursor: initialized.next_cursor, limit: 1 });
    expect(page.events.map((event) => event.event_id)).toEqual(["evt-2"]);
    expect(page.has_more).toBe(true);
    expect(page.events[0].payload.email.body).toBeUndefined();

    await expect(listIntegrationEvents("user-beta", { cursor: initialized.next_cursor })).rejects.toThrow("cursor is invalid");
  });

  it("publishes only bounded plain text when body inclusion is enabled", () => {
    const payload = buildEventFeedPayload({
      ...eventPayload("Private"),
      activity_callback: { url: "https://secret.example/callback" },
      email: {
        ...eventPayload("Private").email,
        body: { text: "safe text", html: "<strong>secret html</strong>" },
        headers: { authorization: "secret" },
        attachments: [{ filename: "note.txt", content_base64: "c2VjcmV0" }],
      },
    }, true);
    expect(payload.email.body).toEqual({ text: "safe text" });
    expect(payload.email.headers).toBeUndefined();
    expect(payload.email.attachments[0].content_base64).toBeUndefined();
    expect(payload.activity_callback).toBeUndefined();
  });

  it("removes expired feed payloads without deleting correlated activities", async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    await maybePruneExpiredPostProcessingEvents({ force: true });
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("not exists (select 1 from email_automation_activities"), [expect.any(Date)]);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("set payload=null"), [expect.any(Date)]);
  });
});

function eventPayload(subject) {
  return {
    email: {
      id: `email-${subject}`,
      thread_id: `thread-${subject}`,
      account_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      account_email: "owner@example.com",
      provider: "gmail",
      from: { email: "sender@example.com", name: "Sender" },
      subject,
      received_at: "2026-11-07T17:59:00Z",
      body: { text: "private", html: "<p>private</p>" },
      headers: {},
      attachments: [],
    },
    classification: { labels: [{ name: "General" }], attention: null },
  };
}
