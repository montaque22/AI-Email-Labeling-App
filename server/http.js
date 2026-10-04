// One place where outbound HTTP gets a time bound.
//
// Bare fetch() has no timeout: a peer that accepts the connection and then goes quiet holds
// the request open indefinitely. That is survivable when one request waits on one call, and
// is not survivable once a request fans out over a batch -- no amount of batch-level
// deadline logic can bound a response if a single call underneath it never returns.

/** Outbound provider calls (Gmail, IMAP-over-HTTP helpers). Generous: these normally answer in well under a second. */
export const PROVIDER_REQUEST_TIMEOUT_MS = 15_000;

/**
 * fetch() that gives up after `timeoutMs` instead of waiting forever.
 *
 * A timeout surfaces as an ordinary Error naming the host and the budget, so callers that
 * log or report the failure say something useful rather than "This operation was aborted".
 *
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {number} [timeoutMs]
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = PROVIDER_REQUEST_TIMEOUT_MS) {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      const timeout = new Error(`Request to ${safeHost(url)} timed out after ${timeoutMs}ms`);
      timeout.status = 504;
      timeout.cause = error;
      throw timeout;
    }

    throw error;
  }
}

/**
 * @param {string} url
 * @returns {string}
 */
function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "the remote host";
  }
}
