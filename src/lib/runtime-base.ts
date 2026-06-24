const API_PATH_PREFIXES = ["/api/", "/mcp"];

export function getRuntimeBasePath() {
  if (typeof window === "undefined") {
    return "";
  }

  const configuredBase = readConfiguredBasePath();
  if (configuredBase !== null) {
    return configuredBase;
  }

  const ingressMatch = window.location.pathname.match(/^(.*\/api\/hassio_ingress\/[^/]+)(?:\/.*)?$/);
  if (ingressMatch?.[1]) {
    return ingressMatch[1].replace(/\/$/, "");
  }

  const homeAssistantBase = readHomeAssistantIngressBase();
  if (homeAssistantBase) {
    return homeAssistantBase;
  }

  return "";
}

export function getRuntimeUrl(path: string) {
  if (!path.startsWith("/")) {
    return path;
  }

  return `${getRuntimeBasePath()}${path}`;
}

export function getAbsoluteRuntimeUrl(path: string) {
  if (typeof window === "undefined") {
    return path;
  }

  return new URL(getRuntimeUrl(path), window.location.origin).toString();
}

export function installRuntimeFetchBase() {
  if (typeof window === "undefined" || window.__emailableFetchBaseInstalled) {
    return;
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === "string") {
      return originalFetch(rewriteRuntimePath(input), init);
    }

    if (input instanceof Request && shouldRewritePath(input.url)) {
      return originalFetch(new Request(rewriteRuntimePath(input.url), input), init);
    }

    if (input instanceof URL) {
      return originalFetch(new URL(rewriteRuntimePath(input.toString())), init);
    }

    return originalFetch(input, init);
  };

  window.__emailableFetchBaseInstalled = true;
}

function rewriteRuntimePath(value: string) {
  if (!shouldRewritePath(value)) {
    return value;
  }

  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    url.pathname = `${getRuntimeBasePath()}${url.pathname}`;
    return url.toString();
  }

  return getRuntimeUrl(value);
}

function shouldRewritePath(value: string) {
  const basePath = getRuntimeBasePath();

  if (!basePath) {
    return false;
  }

  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    return url.origin === window.location.origin && API_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
  }

  return API_PATH_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function readConfiguredBasePath() {
  const value = window.__EMAILABLE_BASE_PATH__?.trim();
  if (value === undefined) {
    return null;
  }

  if (!value || value === "/") {
    return "";
  }

  return value.startsWith("/") ? value.replace(/\/$/, "") : `/${value.replace(/\/$/, "")}`;
}

function readHomeAssistantIngressBase() {
  const hassUrl = window.hassUrl;
  if (typeof hassUrl !== "function") {
    return "";
  }

  try {
    const testUrl = new URL(hassUrl("/api/health"), window.location.origin);
    const match = testUrl.pathname.match(/^(.*\/api\/hassio_ingress\/[^/]+)\/api\/health$/);
    return match?.[1]?.replace(/\/$/, "") ?? "";
  } catch {
    return "";
  }
}

declare global {
  interface Window {
    __EMAILABLE_BASE_PATH__?: string;
    __emailableFetchBaseInstalled?: boolean;
    hassUrl?: (path: string) => string;
  }
}
