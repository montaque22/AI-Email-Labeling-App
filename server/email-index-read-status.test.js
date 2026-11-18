import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("./db.js", () => ({ dbPool: { query } }));

const { updateEmailIndexReadStatus } = await import("./email-index.js");

describe("email index read status", () => {
  beforeEach(() => query.mockReset());

  it("reports a change only when the stored read state changes", async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "row-1" }] });
    await expect(updateEmailIndexReadStatus("user-1", {
      accountId: "account-1",
      emailId: "email-1",
      isRead: true,
      mailbox: "INBOX",
    })).resolves.toBe(true);
    expect(query.mock.calls[0][0]).toContain("is_read is distinct from $5");

    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(updateEmailIndexReadStatus("user-1", {
      accountId: "account-1",
      emailId: "email-1",
      isRead: true,
      mailbox: "INBOX",
    })).resolves.toBe(false);
  });
});
