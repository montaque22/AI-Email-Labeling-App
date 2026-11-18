import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearBadgeCount: vi.fn(),
  decryptToken: vi.fn((value) => `decrypted:${value}`),
  encryptToken: vi.fn((value) => `encrypted:${value}`),
  generateVapidKeys: vi.fn(() => ({ publicKey: "generated-public", privateKey: "generated-private" })),
  log: vi.fn(),
  query: vi.fn(),
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
  unreadCount: vi.fn(),
}));

vi.mock("web-push", () => ({
  default: {
    generateVAPIDKeys: mocks.generateVapidKeys,
    sendNotification: mocks.sendNotification,
    setVapidDetails: mocks.setVapidDetails,
  },
}));
vi.mock("./db.js", () => ({ dbPool: { query: mocks.query } }));
vi.mock("./email-accounts.js", () => ({ decryptToken: mocks.decryptToken, encryptToken: mocks.encryptToken }));
vi.mock("./email-index.js", () => ({ countUnreadEmailIndexEntries: mocks.unreadCount }));
vi.mock("./session.js", () => ({ requireSession: vi.fn() }));
vi.mock("./system-logs.js", () => ({ logSystemEvent: mocks.log }));

const {
  buildPushPayload,
  parsePushSubscription,
  sendProcessedEmailNotification,
  sendPushNotification,
} = await import("./push-notifications.js");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.unreadCount.mockResolvedValue(7);
  mocks.query.mockImplementation(async (sql) => {
    const query = String(sql);
    if (query.includes("push_notification_configuration")) {
      return { rows: [{ publicKey: "stored-public", encryptedPrivateKey: "stored-private" }] };
    }
    if (query.includes("from push_subscriptions")) {
      return {
        rows: [{ endpoint: "https://push.example/subscription", expirationTime: null, p256dh: "public-key", auth: "auth-key" }],
      };
    }
    return { rows: [], rowCount: 1 };
  });
  mocks.sendNotification.mockResolvedValue({ statusCode: 201 });
  mocks.log.mockResolvedValue(undefined);
});

describe("push notification subscriptions", () => {
  it("accepts a standards-based HTTPS subscription", () => {
    expect(parsePushSubscription({
      endpoint: "https://push.example/subscription",
      expirationTime: null,
      keys: { p256dh: "public-key", auth: "auth-key" },
    })).toEqual({
      endpoint: "https://push.example/subscription",
      expirationTime: null,
      keys: { p256dh: "public-key", auth: "auth-key" },
    });
  });

  it("rejects insecure or incomplete subscriptions", () => {
    expect(() => parsePushSubscription({ endpoint: "http://push.example/subscription", keys: { p256dh: "key", auth: "auth" } }))
      .toThrow("must use HTTPS");
    expect(() => parsePushSubscription({ endpoint: "https://push.example/subscription", keys: {} }))
      .toThrow("keys are invalid");
  });
});

describe("push delivery", () => {
  it("includes the unread-email badge count in every user-visible payload", async () => {
    const result = await sendProcessedEmailNotification("user-1", {
      accountId: "account-1",
      emailId: "email-1",
      sender: "Sender",
      subject: "Project update",
      labels: ["Action Required"],
    });

    expect(result).toMatchObject({ attempted: 1, delivered: 1, removed: 0, failed: 0 });
    expect(mocks.setVapidDetails).toHaveBeenCalledWith(expect.stringMatching(/^(mailto:|https:\/\/)/), "stored-public", "decrypted:stored-private");
    const payload = JSON.parse(mocks.sendNotification.mock.calls[0][1]);
    expect(payload).toMatchObject({
      title: "New email labeled Action Required",
      body: "Sender: Project update",
      badgeCount: 7,
      url: "inbox",
    });
  });

  it("removes expired subscriptions without failing email processing", async () => {
    mocks.sendNotification.mockRejectedValueOnce(Object.assign(new Error("Gone"), { statusCode: 410 }));

    await expect(sendPushNotification("user-1", { title: "Test" }))
      .resolves.toMatchObject({ attempted: 1, delivered: 0, removed: 1, failed: 0 });
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("delete from push_subscriptions"),
      ["user-1", expect.any(String)],
    );
  });

  it("builds a service-worker payload with a numeric badge", () => {
    expect(buildPushPayload({ title: "New mail", body: "Ready" }, 3)).toMatchObject({
      title: "New mail",
      body: "Ready",
      badgeCount: 3,
      icon: "pwa-192.png",
    });
  });
});
