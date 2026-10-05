// Containment for fire-and-forget work.
//
// Several request handlers answer the client before the real work is done and hand the
// remainder to a detached async function. Node >= 22 terminates the process on an unhandled
// rejection, so a detached body that throws — including one that throws while *recording*
// an earlier failure — takes the whole Express server down with it. Everything detached goes
// through `runDetachedTask`, and every best-effort recovery write inside a catch goes through
// `runGuardedStep`, so no rejection can reach the process.

/**
 * Normalizes anything throwable into an Error without losing the original value.
 *
 * @param {unknown} value
 * @returns {Error}
 */
function toError(value) {
  if (value instanceof Error) {
    return value;
  }

  return new Error(typeof value === "string" && value ? value : String(value));
}

/**
 * Runs `task` detached from the caller and guarantees it cannot reject.
 *
 * This is the only sanctioned way to start fire-and-forget work. Returns immediately; the
 * task's own failure handling is expected to have already run by the time anything lands
 * here, so reaching the boundary catch means the task's error handling itself failed.
 *
 * @param {string} label Stable identifier for the work, used in the boundary log line.
 * @param {() => Promise<void>} task
 * @returns {void}
 */
export function runDetachedTask(label, task) {
  // `Promise.resolve().then(task)` rather than `task()` so a synchronous throw inside the
  // task body is funnelled into the same catch as an asynchronous one.
  void Promise.resolve()
    .then(task)
    .catch((error) => {
      console.error(`Detached task "${label}" failed and was contained:`, toError(error));
    });
}

/**
 * Runs one best-effort step — typically a DB write or a log write inside a catch block —
 * and reports whether it worked instead of throwing.
 *
 * Recovery paths call several of these in sequence. Guarding each one individually means a
 * failing metadata write still lets the system-event write and the background-task update
 * run, which is the difference between a partially recorded failure and a silent one.
 *
 * @template TResult
 * @param {string} label
 * @param {() => Promise<TResult>} step
 * @returns {Promise<{ ok: true, value: TResult } | { ok: false, error: Error }>}
 */
export async function runGuardedStep(label, step) {
  try {
    return { ok: true, value: await step() };
  } catch (error) {
    const normalized = toError(error);
    console.error(`Guarded step "${label}" failed and was contained:`, normalized);
    return { ok: false, error: normalized };
  }
}

/**
 * Installs the process-level safety net.
 *
 * Defense in depth only: every known detached path is wrapped at its call site. This exists
 * so a path nobody wrapped — a stray `void promise`, a listener in a dependency — degrades
 * to a loud log line instead of killing a server that is otherwise healthy.
 *
 * Both handlers keep the process alive. That is the deliberate trade: Node's own advice is
 * that state after `uncaughtException` is undefined, but this is a single-process self-hosted
 * app where exiting drops every other user's in-flight work, and startup already tolerates a
 * failed migration rather than refusing to serve. The log line is the signal; it is loud and
 * tagged so a supervisor or log scrape can act on it.
 *
 * @returns {void}
 */
export function installProcessSafetyNet() {
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled promise rejection (process kept alive):", toError(reason));
  });

  process.on("uncaughtException", (error) => {
    console.error("Uncaught exception (process kept alive):", toError(error));
  });
}
