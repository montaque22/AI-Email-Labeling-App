import { describe, expect, it } from "vitest";
import { readPublicPage } from "./research-tools.js";

describe("public research tools", () => {
  it.each([
    "http://127.0.0.1:3000/private",
    "http://10.0.0.4/internal",
    "http://192.168.1.10/router",
    "http://[::1]/private",
    "http://[::ffff:192.168.1.10]/private",
  ])("blocks private-network research targets: %s", async (url) => {
    await expect(readPublicPage({ url })).rejects.toThrow("Private or local network URLs are not allowed");
  });

  it("rejects non-HTTP research targets", async () => {
    await expect(readPublicPage({ url: "file:///etc/passwd" })).rejects.toThrow("Only public HTTP and HTTPS URLs");
  });
});
