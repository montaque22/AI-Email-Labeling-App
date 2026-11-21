import { describe, expect, it } from "vitest";
import { buildComposeBodyMimeLines, sanitizeComposeHtml } from "./email-compose-content.js";

describe("email compose content", () => {
  it("builds plain text and HTML alternatives for formatted mail", () => {
    const mime = buildComposeBodyMimeLines(
      { bodyText: "Hello team", bodyHtml: "<p><strong>Hello</strong> team</p>" },
      () => "fixed",
    ).join("\r\n");

    expect(mime).toContain('multipart/alternative; boundary="emailable-alternative-fixed"');
    expect(mime).toContain("Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\nHello team");
    expect(mime).toContain("Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n<p><strong>Hello</strong> team</p>");
  });

  it("removes executable markup from outgoing HTML", () => {
    const sanitized = sanitizeComposeHtml('<p onclick="bad()">Hello</p><script>bad()</script><a href="javascript:bad()">link</a>');
    expect(sanitized).toBe("<p>Hello</p><a>link</a>");
  });
});
