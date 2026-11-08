import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  log: vi.fn(),
}));

vi.mock("./db.js", () => ({ dbPool: { query: mocks.query } }));
vi.mock("./system-logs.js", () => ({ logSystemEvent: mocks.log }));

const {
  emitWebhookEventDetached,
  waitForPendingWebhookDeliveries,
} = await import("./webhooks.js");

beforeEach(() => {
  mocks.query.mockReset().mockResolvedValue({
    rows: [{ url: "https://workflow.example/webhook", bearerToken: null }],
  });
  mocks.log.mockReset().mockResolvedValue(undefined);
  vi.unstubAllGlobals();
});

describe("outbound webhook delivery", () => {
  it("returns immediately while the remote webhook is still pending", async () => {
    let finishRequest;
    const fetchMock = vi.fn(() => new Promise((resolve) => {
      finishRequest = resolve;
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = emitWebhookEventDetached("user-1", "email.received", { emailId: "email-1" });

    expect(result).toBeUndefined();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(mocks.log).not.toHaveBeenCalled();

    finishRequest({ ok: true, status: 200 });
    await waitForPendingWebhookDeliveries();

    expect(mocks.log).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ status: "success" }),
    );
  });

  it("contains non-200 and malformed remote responses inside the delivery worker", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "not-json: no item to return",
    }));
    const onDelivery = vi.fn();

    expect(() => emitWebhookEventDetached(
      "user-1",
      "email.received",
      { emailId: "email-1" },
      { onDelivery },
    )).not.toThrow();
    await waitForPendingWebhookDeliveries();

    expect(onDelivery).toHaveBeenCalledWith({ status: "failed", httpStatus: 500 });
    expect(mocks.log).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        status: "error",
        payload: expect.objectContaining({ response: "not-json: no item to return" }),
      }),
    );
  });
});
