import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

let app;
const originalNodeEnvironment = process.env.NODE_ENV;
const originalLocalDevAuth = process.env.LOCAL_DEV_AUTH;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  delete process.env.LOCAL_DEV_AUTH;
  ({ app } = await import("./index.js"));
});

afterAll(() => {
  if (originalNodeEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnvironment;
  if (originalLocalDevAuth === undefined) delete process.env.LOCAL_DEV_AUTH;
  else process.env.LOCAL_DEV_AUTH = originalLocalDevAuth;
});

describe("backend API contracts", () => {
  it("reports service health", async () => {
    const response = await request(app).get("/api/health").expect(200);
    expect(response.body).toEqual({ ok: true, service: "ai-email-labeling-app" });
  });

  it("reports supported authentication methods", async () => {
    const response = await request(app).get("/api/auth-settings").expect(200);
    expect(response.body).toMatchObject({ emailAndPasswordEnabled: true });
    expect(typeof response.body.googleOAuthEnabled).toBe("boolean");
  });

  it("does not expose local development authentication unless explicitly enabled", async () => {
    const response = await request(app).get("/api/local-development-session").expect(404);
    expect(response.body.error).toBe("Local development authentication is disabled");
  });

  it("returns JSON for unknown API routes instead of the frontend shell", async () => {
    const response = await request(app).get("/api/not-a-real-route").expect(404);
    expect(response.body).toEqual({ error: "API route not found" });
  });
});
