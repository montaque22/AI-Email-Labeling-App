/**
 * `fetch` with caching defeated and cookies attached.
 *
 * Lives here rather than in `App.tsx` so components split out of it keep using the same
 * request defaults instead of growing their own copy.
 */
export function fetchNoStore(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-cache");

  return fetch(input, {
    ...init,
    cache: "no-store",
    credentials: init.credentials ?? "include",
    headers,
  });
}
