import dns from "node:dns/promises";
import net from "node:net";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_DOWNLOAD_BYTES = 12 * 1024 * 1024;
const MAX_TEXT_LENGTH = 30_000;
const MAX_REDIRECTS = 4;

export async function searchPublicWeb({ query, limit = 5 } = {}) {
  const normalizedQuery = String(query || "").trim();
  if (!normalizedQuery) throw new Error("A non-empty search query is required.");
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 10));
  const url = new URL("https://html.duckduckgo.com/html/");
  url.searchParams.set("q", normalizedQuery);
  const response = await fetchPublicResource(url, { maxBytes: 2 * 1024 * 1024 });
  const html = new TextDecoder().decode(response.bytes);
  const results = parseDuckDuckGoResults(html).slice(0, safeLimit);
  if (results.length === 0) {
    throw new Error("The public search service returned no readable results. Try a different query or another research source.");
  }
  return { query: normalizedQuery, results, sources: results };
}

export async function readPublicPage({ url, maxCharacters = 18_000 } = {}) {
  const response = await fetchPublicResource(url);
  const contentType = response.contentType.toLowerCase();
  const limit = Math.max(1_000, Math.min(Number(maxCharacters) || 18_000, MAX_TEXT_LENGTH));
  if (contentType.includes("application/pdf") || response.url.toLowerCase().endsWith(".pdf")) {
    const text = await extractPdfText(response.bytes, limit);
    return {
      contentType: "application/pdf",
      sourceType: "pdf",
      text,
      title: pdfTitleFromUrl(response.url),
      url: response.url,
      sources: [{ sourceType: "pdf", title: pdfTitleFromUrl(response.url), url: response.url }],
    };
  }
  if (!contentType.includes("text/html") && !contentType.includes("text/plain") && contentType) {
    throw new Error(`Unsupported public document type: ${contentType}.`);
  }
  const raw = new TextDecoder().decode(response.bytes);
  const title = contentType.includes("text/html") ? extractHtmlTitle(raw) : new URL(response.url).hostname;
  const text = contentType.includes("text/html") ? htmlToReadableText(raw) : normalizeWhitespace(raw);
  if (!text) throw new Error("The public page did not contain readable text.");
  return {
    contentType: contentType || "text/plain",
    sourceType: "webpage",
    text: truncate(text, limit),
    title,
    url: response.url,
    sources: [{ sourceType: "webpage", title, url: response.url }],
  };
}

async function fetchPublicResource(input, { maxBytes = MAX_DOWNLOAD_BYTES } = {}) {
  let current = await assertPublicUrl(input);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(current, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9,*/*;q=0.2",
        "User-Agent": "EmailableResearch/1.0 (+https://emailable.app)",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("The public page redirected without a destination.");
      current = await assertPublicUrl(new URL(location, current));
      continue;
    }
    if (!response.ok) throw new Error(`The public page returned HTTP ${response.status}.`);
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > maxBytes) throw new Error("The public document is too large to inspect safely.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error("The public document is too large to inspect safely.");
    return {
      bytes,
      contentType: response.headers.get("content-type")?.split(";")[0]?.trim() || "",
      url: current.toString(),
    };
  }
  throw new Error("The public page exceeded the redirect limit.");
}

async function assertPublicUrl(input) {
  const url = input instanceof URL ? new URL(input) : new URL(String(input || ""));
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only public HTTP and HTTPS URLs can be researched.");
  if (url.username || url.password) throw new Error("URLs with embedded credentials are not allowed.");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("Private or local network URLs are not allowed.");
  }
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error("Private or local network URLs are not allowed.");
  } else {
    const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
      throw new Error("The URL resolves to a private or unavailable network address.");
    }
  }
  return url;
}

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    if (net.isIPv4(mapped)) return isPrivateAddress(mapped);
    const words = mapped.split(":");
    if (words.length === 2) {
      const high = Number.parseInt(words[0], 16);
      const low = Number.parseInt(words[1], 16);
      if (Number.isFinite(high) && Number.isFinite(low)) {
        return isPrivateAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
      }
    }
  }
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
}

function parseDuckDuckGoResults(html) {
  const results = [];
  const pattern = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>)?/gi;
  for (const match of html.matchAll(pattern)) {
    const url = unwrapDuckDuckGoUrl(decodeHtml(match[1]));
    if (!url?.startsWith("http")) continue;
    results.push({
      excerpt: truncate(htmlToReadableText(match[3] || ""), 800),
      sourceType: "search_result",
      title: truncate(htmlToReadableText(match[2]), 300),
      url,
    });
  }
  return dedupeByUrl(results);
}

function unwrapDuckDuckGoUrl(value) {
  try {
    const url = new URL(value, "https://duckduckgo.com");
    const target = url.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : url.toString();
  } catch {
    return "";
  }
}

async function extractPdfText(bytes, maxCharacters) {
  const document = await getDocument({ data: bytes, disableFontFace: true }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => typeof item.str === "string" ? item.str : "").join(" "));
    if (pages.join("\n\n").length >= maxCharacters) break;
  }
  const text = truncate(normalizeWhitespace(pages.join("\n\n")), maxCharacters);
  if (!text) throw new Error("The PDF did not contain extractable text.");
  return text;
}

function htmlToReadableText(html) {
  return normalizeWhitespace(decodeHtml(String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")));
}

function extractHtmlTitle(html) {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "";
  return truncate(htmlToReadableText(title), 300) || "Public webpage";
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_match, digits) => String.fromCodePoint(Number.parseInt(digits, 10)));
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function pdfTitleFromUrl(url) {
  const pathname = new URL(url).pathname;
  return decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) || "Public PDF");
}

function dedupeByUrl(items) {
  const seen = new Set();
  return items.filter((item) => item.url && !seen.has(item.url) && seen.add(item.url));
}

function truncate(value, limit) {
  const text = String(value || "").trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}
