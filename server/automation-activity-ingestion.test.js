import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVITY_CALLBACK_EXAMPLES } from "../shared/webhook-contracts.js";

const mocks = vi.hoisted(() => ({
  activities: new Map(),
  events: new Map(),
  query: vi.fn(),
  connect: vi.fn(),
  log: vi.fn(),
}));

vi.mock("./db.js", () => ({ dbPool: { query: mocks.query, connect: mocks.connect } }));
vi.mock("./session.js", () => ({ requireSession: (_req, _res, next) => next() }));
vi.mock("./webhooks.js", () => ({ emitWebhookEventDetached: vi.fn() }));
vi.mock("./system-logs.js", () => ({ logSystemEvent: mocks.log }));

const { ingestActivityCallback, parseActivityCallback } = await import("./automation-activity.js");

beforeEach(() => {
  mocks.activities.clear();
  mocks.events.clear();
  mocks.log.mockReset().mockResolvedValue(undefined);
  mocks.events.set("user-alpha:evt_123", {
    event_id: "evt_123",
    email_index_id: "index-1",
    email_account_id: "account-1",
    email_id: "email-1",
  });
  const client = { query: vi.fn(runQuery), release: vi.fn() };
  mocks.connect.mockReset().mockResolvedValue(client);
});

describe("automation activity outcome ingestion", () => {
  it("stores completed and failed outcomes as independent activities", async () => {
    const completed = parseActivityCallback(ACTIVITY_CALLBACK_EXAMPLES.completed);
    const failed = parseActivityCallback({
      ...ACTIVITY_CALLBACK_EXAMPLES.failed,
      activity_id: "activity_failed_2",
    });
    expect(completed.ok && failed.ok).toBe(true);

    await expect(ingestActivityCallback("user-alpha", completed.value)).resolves.toMatchObject({ status: "completed", duplicate: false });
    await expect(ingestActivityCallback("user-alpha", failed.value)).resolves.toMatchObject({ status: "failed", duplicate: false });
    expect(mocks.activities.size).toBe(2);
  });

  it("is idempotent for an identical report and rejects a contradiction", async () => {
    const parsed = parseActivityCallback(ACTIVITY_CALLBACK_EXAMPLES.completed);
    await ingestActivityCallback("user-alpha", parsed.value);
    await expect(ingestActivityCallback("user-alpha", parsed.value)).resolves.toMatchObject({ duplicate: true });

    const contradiction = parseActivityCallback({
      ...ACTIVITY_CALLBACK_EXAMPLES.failed,
      activity_id: ACTIVITY_CALLBACK_EXAMPLES.completed.activity_id,
    });
    await expect(ingestActivityCallback("user-alpha", contradiction.value)).rejects.toMatchObject({ status: 409 });
    expect(mocks.activities.size).toBe(1);
  });

  it("rejects an event that is not owned by the API-key user", async () => {
    const parsed = parseActivityCallback(ACTIVITY_CALLBACK_EXAMPLES.completed);
    await expect(ingestActivityCallback("user-beta", parsed.value)).rejects.toMatchObject({ status: 404 });
  });
});

async function runQuery(sql, params = []) {
  const text = String(sql).replace(/\s+/g, " ").trim();
  if (["begin", "commit", "rollback"].includes(text)) return { rows: [] };
  if (text.startsWith("select activity_callback_enabled")) return { rows: [{ enabled: true }] };
  if (text.startsWith("select event_id")) return { rows: [mocks.events.get(`${params[0]}:${params[1]}`)].filter(Boolean) };
  if (text.startsWith("select * from email_automation_activities")) return { rows: [mocks.activities.get(activityKey(params[0], params[1], params[2]))].filter(Boolean) };
  if (text.startsWith("select callback_count")) return { rows: [{ callback_count: 0 }] };
  if (text.startsWith("select tokens")) return { rows: [{ tokens: 10, updated_at: new Date() }] };
  if (text.startsWith("insert into email_automation_activities")) {
    const row = {
      user_id: params[1], event_id: params[2], activity_id: params[6], source: params[7], status: params[8],
      title: params[9], description: params[10], details: JSON.parse(params[11]), error: params[12] ? JSON.parse(params[12]) : null,
      reported_at: params[13], received_at: params[14],
    };
    mocks.activities.set(activityKey(row.user_id, row.event_id, row.activity_id), row);
    return { rows: [] };
  }
  if (text.startsWith("insert into activity_callback_usage") || text.startsWith("insert into activity_callback_rate_limits") || text.startsWith("update activity_callback_rate_limits")) return { rows: [] };
  throw new Error(`Unexpected query: ${text}`);
}

function activityKey(userId, eventId, activityId) {
  return `${userId}:${eventId}:${activityId}`;
}
