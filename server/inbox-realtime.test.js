import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendSync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./push-notifications.js", () => ({ sendInboxSyncNotification: mocks.sendSync }));
vi.mock("./session.js", () => ({ requireSession: vi.fn((_req, _res, next) => next?.()) }));
vi.mock("./detached-tasks.js", () => ({
  runGuardedStep: vi.fn(async (_name, operation) => operation()),
}));

const { publishInboxChange, registerInboxRealtimeRoutes } = await import("./inbox-realtime.js");

describe("inbox realtime synchronization", () => {
  it("streams user-scoped inbox changes and starts a badge synchronization push", async () => {
    let routeHandler;
    registerInboxRealtimeRoutes({ get: (_path, _middleware, handler) => { routeHandler = handler; } });
    const request = Object.assign(new EventEmitter(), { user: { id: "user-1" } });
    const writes = [];
    const response = {
      end: vi.fn(),
      flushHeaders: vi.fn(),
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      write: vi.fn((value) => writes.push(value)),
    };
    routeHandler(request, response);

    const event = publishInboxChange("user-1", {
      reason: "deleted",
      messages: [{ accountId: "account-1", emailId: "email-1", mailbox: "INBOX" }],
    });
    await vi.waitFor(() => expect(mocks.sendSync).toHaveBeenCalledWith("user-1", event));
    expect(writes.join(""))
      .toContain('event: inbox-changed\ndata: {"reason":"deleted","messages":[{"accountId":"account-1","emailId":"email-1","mailbox":"INBOX"}]');

    request.emit("close");
    expect(response.end).toHaveBeenCalled();
  });

  it("can broadcast a new-email event without a duplicate synchronization push", () => {
    mocks.sendSync.mockClear();
    publishInboxChange("user-2", { reason: "new-email" }, { push: false });
    expect(mocks.sendSync).not.toHaveBeenCalled();
  });
});
