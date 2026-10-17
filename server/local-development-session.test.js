import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();

vi.mock("./db.js", () => ({
  dbPool: { query },
}));

const { isLocalDevelopmentSessionEnabled, isLoopbackRequest, resolveLocalDevelopmentUser } = await import(
  "./local-development-session.js"
);

const originalEnvironment = { ...process.env };

function request({ host = "localhost:3000", remoteAddress = "127.0.0.1" } = {}) {
  return {
    get: (name) => (name === "host" ? host : undefined),
    socket: { remoteAddress },
  };
}

describe("local development sessions", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "development";
    process.env.LOCAL_DEV_AUTH = "true";
    delete process.env.LOCAL_DEV_USER_EMAIL;
    query.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
  });

  it("is permanently disabled in production", () => {
    process.env.NODE_ENV = "production";
    expect(isLocalDevelopmentSessionEnabled()).toBe(false);
  });

  it("accepts only a loopback host from a loopback connection", () => {
    expect(isLoopbackRequest(request())).toBe(true);
    expect(isLoopbackRequest(request({ host: "127.0.0.1:3000", remoteAddress: "::ffff:127.0.0.1" }))).toBe(true);
    expect(isLoopbackRequest(request({ host: "emailable.example.com" }))).toBe(false);
    expect(isLoopbackRequest(request({ remoteAddress: "10.0.0.25" }))).toBe(false);
  });

  it("selects the existing user with the most indexed mail", async () => {
    query.mockResolvedValue({
      rows: [{ id: "user-1", name: "Local User", email: "local@example.com", indexedEmailCount: 375 }],
    });

    await expect(resolveLocalDevelopmentUser(request())).resolves.toMatchObject({
      id: "user-1",
      email: "local@example.com",
      localDevelopment: true,
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("order by count(indexed.id) desc"), []);
  });

  it("supports selecting an explicit local user by email", async () => {
    process.env.LOCAL_DEV_USER_EMAIL = "OWNER@EXAMPLE.COM";
    query.mockResolvedValue({ rows: [{ id: "user-2", name: "Owner", email: "owner@example.com" }] });

    await resolveLocalDevelopmentUser(request());

    expect(query).toHaveBeenCalledWith(expect.stringContaining("where lower(u.email) = $1"), ["owner@example.com"]);
  });

  it("never queries the database for a remote request", async () => {
    await expect(resolveLocalDevelopmentUser(request({ host: "emailable.example.com" }))).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
});
