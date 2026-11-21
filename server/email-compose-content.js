import crypto from "node:crypto";

export function buildComposeBodyMimeLines(compose, createId = () => crypto.randomUUID()) {
  if (!compose.bodyHtml) {
    return [
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      compose.bodyText || "",
    ];
  }

  const boundary = `emailable-alternative-${createId()}`;
  return [
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    compose.bodyText || "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    compose.bodyHtml,
    `--${boundary}--`,
    "",
  ];
}

export function sanitizeComposeHtml(html) {
  return String(html || "")
    .replace(/<(script|style|iframe|object|embed|applet|form)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed|applet|form)\b[^>]*\/?>/gi, "")
    .replace(/\s(?:on[a-z]+|srcdoc)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:href|src)\s*=\s*(["'])\s*(?:javascript|data:text\/html)[\s\S]*?\1/gi, "")
    .replace(/javascript:/gi, "");
}
