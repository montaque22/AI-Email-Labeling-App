const RESEARCH_TOOL_PATTERN = /(^|[_-])(web|browser|research|page|document)([_-]|$)|search[_-]?web|read[_-]?(url|page|document)/i;
const SOURCE_COLLECTION_KEYS = new Set(["sources", "citations", "references"]);

export function extractAgentResearchSources(toolResults = []) {
  const sources = [];
  const seen = new Set();
  for (const entry of toolResults) {
    const payload = parseToolPayload(entry?.result);
    if (!payload) continue;
    collectExplicitSourceCollections(payload, sources, seen);
    if (RESEARCH_TOOL_PATTERN.test(String(entry?.toolName ?? ""))) collectUrlRecords(payload, sources, seen);
  }
  return sources.slice(0, 12);
}

function collectExplicitSourceCollections(value, sources, seen, depth = 0) {
  if (!value || depth > 5) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectExplicitSourceCollections(item, sources, seen, depth + 1));
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (SOURCE_COLLECTION_KEYS.has(key.toLowerCase()) && Array.isArray(child)) child.forEach((item) => addSource(item, sources, seen));
    else collectExplicitSourceCollections(child, sources, seen, depth + 1);
  }
}

function collectUrlRecords(value, sources, seen, depth = 0) {
  if (!value || depth > 5) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectUrlRecords(item, sources, seen, depth + 1));
    return;
  }
  if (typeof value !== "object") return;
  addSource(value, sources, seen);
  Object.values(value).forEach((child) => collectUrlRecords(child, sources, seen, depth + 1));
}

function addSource(value, sources, seen) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const url = firstString(value.url, value.href, value.link, value.sourceUrl, value.source_url);
  if (!url || seen.has(url)) return;
  let parsed;
  try { parsed = new URL(url); } catch { return; }
  if (!["http:", "https:"].includes(parsed.protocol)) return;
  seen.add(url);
  sources.push({
    url,
    title: firstString(value.title, value.name, value.pageTitle, value.documentTitle) || parsed.hostname,
    domain: firstString(value.domain, value.siteName, value.site_name) || parsed.hostname.replace(/^www\./, ""),
    sourceType: firstString(value.sourceType, value.source_type, value.type) || "webpage",
    date: firstString(value.date, value.publishedAt, value.published_at, value.updatedAt, value.updated_at),
    excerpt: firstString(value.excerpt, value.snippet, value.description, value.summary),
  });
}

function firstString(...values) {
  const value = values.find((item) => typeof item === "string" && item.trim());
  return typeof value === "string" ? value.trim().slice(0, 1000) : "";
}

function parseToolPayload(value) {
  if (!value || typeof value !== "object") return null;
  if (!Array.isArray(value.content)) return value;
  const text = value.content.find((entry) => entry?.type === "text" && typeof entry.text === "string")?.text;
  if (!text) return value;
  try { return JSON.parse(text); } catch { return value; }
}
