import { describe, expect, it, vi } from "vitest";

vi.mock("./db.js", () => ({ dbPool: null }));
vi.mock("./byoai.js", () => ({ generateAiLabel: vi.fn(), isAiActiveForUser: vi.fn() }));
vi.mock("./background-tasks.js", () => ({
  completeBackgroundTask: vi.fn(),
  createBackgroundTask: vi.fn(),
  failBackgroundTask: vi.fn(),
  updateBackgroundTask: vi.fn(),
}));
vi.mock("./integrations.js", () => ({ searchPollingCandidates: vi.fn() }));
vi.mock("./push-notifications.js", () => ({ sendProcessedEmailNotification: vi.fn() }));
vi.mock("./session.js", () => ({ requireSession: vi.fn() }));
vi.mock("./system-logs.js", () => ({ logSystemEvent: vi.fn() }));
vi.mock("./webhooks.js", () => ({ emitWebhookEventDetached: vi.fn() }));

const { processPollingCandidate } = await import("./polling.js");

describe("polling push notification sequencing", () => {
  it("notifies only after AI labeling finishes and includes the final labels", async () => {
    const sequence = [];
    const generateLabel = vi.fn(async () => {
      sequence.push("labeled");
      return { added: ["Finance"] };
    });
    const sendNotification = vi.fn(async (_userId, payload) => {
      sequence.push("notified");
      expect(payload.labels).toEqual(["Finance"]);
    });
    const candidate = {
      account: { id: "account-1", email: "owner@example.com" },
      email: { emailId: "email-1", fromName: "Bank", fromEmail: "bank@example.com", subject: "Statement" },
    };

    await processPollingCandidate("user-1", candidate, { generateLabel, sendNotification });

    expect(sequence).toEqual(["labeled", "notified"]);
    expect(generateLabel).toHaveBeenCalledWith("user-1", { emailId: "email-1", accountEmail: "owner@example.com" });
  });

  it("never notifies when labeling fails", async () => {
    const sendNotification = vi.fn();
    await expect(processPollingCandidate("user-1", {
      account: { id: "account-1", email: "owner@example.com" },
      email: { emailId: "email-1" },
    }, {
      generateLabel: vi.fn().mockRejectedValue(new Error("Labeling failed")),
      sendNotification,
    })).rejects.toThrow("Labeling failed");
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("contains push delivery failures after successful labeling", async () => {
    await expect(processPollingCandidate("user-1", {
      account: { id: "account-1", email: "owner@example.com" },
      email: { emailId: "email-1", subject: "Subject" },
    }, {
      generateLabel: vi.fn().mockResolvedValue({ added: ["General"] }),
      sendNotification: vi.fn().mockRejectedValue(new Error("Push service unavailable")),
    })).resolves.toMatchObject({ added: ["General"] });
  });
});
