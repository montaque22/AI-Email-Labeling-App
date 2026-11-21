export function plainTextToEmailHtml(text: string) {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.trim()) {
    return "";
  }

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function htmlToEmailText(html: string) {
  if (typeof DOMParser === "undefined") {
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(div|p|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .trim();
  }

  const document = new DOMParser().parseFromString(html, "text/html");
  document.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  document.querySelectorAll("p,div,li,h1,h2,h3,h4,h5,h6").forEach((node) => node.append("\n"));
  return (document.body.textContent ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isEffectivelyEmptyHtml(html: string) {
  return !htmlToEmailText(html).trim() && !/<(img|hr)\b/i.test(html);
}

export function looksLikeMarkdownEmail(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return false;
  }

  let score = 0;
  if (/^#{1,4}\s+\S+/m.test(normalized)) score += 3;
  if (/```[\s\S]*?```/.test(normalized)) score += 3;
  if (/^>\s+\S+/m.test(normalized)) score += 2;
  if (/^\|.+\|\s*\n\|\s*:?-{3,}/m.test(normalized)) score += 3;
  if (/\[[^\]]+]\((?:https?:\/\/|mailto:)[^)]+\)/i.test(normalized)) score += 2;
  if (/\*\*[^*\n]+\*\*/.test(normalized) || /__[^_\n]+__/.test(normalized)) score += 1;
  if (/`[^`\n]+`/.test(normalized)) score += 1;

  const unorderedItems = normalized.match(/^\s*[-*+]\s+\S.+$/gm)?.length ?? 0;
  const orderedItems = normalized.match(/^\s*\d+[.)]\s+\S.+$/gm)?.length ?? 0;
  if (unorderedItems >= 2 || orderedItems >= 2) score += 2;

  return score >= 2;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
