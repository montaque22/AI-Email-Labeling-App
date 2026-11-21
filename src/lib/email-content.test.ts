import { describe, expect, it } from "vitest";
import { htmlToEmailText, looksLikeMarkdownEmail, plainTextToEmailHtml } from "./email-content";

describe("email content helpers", () => {
  it("creates safe email HTML from plain text", () => {
    expect(plainTextToEmailHtml("Hello <team>\nNext line")).toBe("<p>Hello &lt;team&gt;<br>Next line</p>");
  });

  it("keeps a readable plain-text alternative for rich text", () => {
    expect(htmlToEmailText("<p><strong>Hello</strong> team</p><p>Next</p>")).toBe("Hello team\nNext");
  });

  it("detects strong markdown signals without treating ordinary punctuation as markdown", () => {
    expect(looksLikeMarkdownEmail("# Update\n\n**Important:** review this.")).toBe(true);
    expect(looksLikeMarkdownEmail("- First item\n- Second item")).toBe(true);
    expect(looksLikeMarkdownEmail("Please review invoice_2026 and reply *soon*.")).toBe(false);
  });
});
