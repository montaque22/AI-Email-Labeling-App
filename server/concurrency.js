// Shared bounded-concurrency primitives for request handlers that fan out over
// provider work. Written by hand on purpose: the behaviour we need (deterministic
// per-index results, isolated failures, a deadline that reports unstarted work
// instead of discarding it) is not what an off-the-shelf limiter returns.

/**
 * @typedef {object} Deadline
 * @property {() => boolean} expired True once the wall-clock budget is used up.
 * @property {() => number} remainingMs Milliseconds left, floored at 0.
 * @property {number} timeoutMs The budget this deadline was created with.
 */

/**
 * A wall-clock budget for one request. Callers check it between units of work;
 * nothing is aborted mid-flight, so work already started always runs to completion.
 *
 * @param {number} timeoutMs
 * @returns {Deadline}
 */
export function createDeadline(timeoutMs) {
  const startedAt = Date.now();
  const budget = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 0;

  return {
    timeoutMs: budget,
    remainingMs: () => Math.max(0, budget - (Date.now() - startedAt)),
    expired: () => budget > 0 && Date.now() - startedAt >= budget,
  };
}

/**
 * The outcome of one item. `not-attempted` means the deadline passed before a
 * worker picked the item up, which is different from the item failing.
 *
 * @template TResult
 * @typedef {{ status: "fulfilled", value: TResult }
 *   | { status: "rejected", reason: Error }
 *   | { status: "not-attempted" }} SettledOutcome
 */

/**
 * Runs `worker` over `items` with at most `limit` calls in flight.
 *
 * Guarantees the callers here rely on:
 * - The returned array is index-aligned with `items`, so results stay deterministic
 *   with respect to the requested order no matter what order the work finished in.
 * - A rejected worker never cancels its siblings; it is reported in its own slot.
 * - When a deadline is supplied, workers stop *claiming* new items once it expires
 *   and the untouched tail comes back as `not-attempted` instead of an error.
 *
 * @template TItem, TResult
 * @param {readonly TItem[]} items
 * @param {object} options
 * @param {number} options.limit Maximum workers in flight; coerced to at least 1.
 * @param {(item: TItem, index: number) => Promise<TResult>} options.worker
 * @param {Deadline} [options.deadline]
 * @returns {Promise<Array<SettledOutcome<TResult>>>}
 */
export async function mapWithConcurrency(items, { limit, worker, deadline }) {
  /** @type {Array<SettledOutcome<TResult>>} */
  const outcomes = new Array(items.length).fill(null).map(() => ({ status: "not-attempted" }));

  if (items.length === 0) {
    return outcomes;
  }

  const workers = Math.max(1, Math.min(Math.trunc(limit) || 1, items.length));
  let nextIndex = 0;

  const runWorker = async () => {
    while (nextIndex < items.length) {
      if (deadline?.expired()) {
        return;
      }

      const index = nextIndex;
      nextIndex += 1;

      try {
        outcomes[index] = { status: "fulfilled", value: await worker(items[index], index) };
      } catch (error) {
        outcomes[index] = { status: "rejected", reason: error instanceof Error ? error : new Error(String(error)) };
      }
    }
  };

  await Promise.all(Array.from({ length: workers }, runWorker));

  return outcomes;
}

/**
 * @typedef {object} TaskQueue
 * @property {(task: () => Promise<void>) => void} push Enqueue work; returns immediately.
 * @property {() => Promise<void>} drain Resolves once the queue is empty and idle.
 * @property {() => number} size Tasks queued but not yet started.
 */

/**
 * A long-lived queue that runs at most `limit` tasks at a time.
 *
 * `mapWithConcurrency` is for a known list a caller waits on; this is for work that arrives
 * over time and that nobody waits on, where the thing worth bounding is how many are in
 * flight rather than how long they take. A task that rejects is reported through `onError`
 * and does not stop the queue.
 *
 * @param {object} options
 * @param {number} options.limit Maximum tasks in flight; coerced to at least 1.
 * @param {(error: Error) => void} [options.onError]
 * @returns {TaskQueue}
 */
export function createTaskQueue({ limit, onError }) {
  const maxInFlight = Math.max(1, Math.trunc(limit) || 1);
  /** @type {Array<() => Promise<void>>} */
  const queued = [];
  /** @type {Array<() => void>} */
  const drainWaiters = [];
  let inFlight = 0;

  const settleDrainWaiters = () => {
    if (inFlight > 0 || queued.length > 0) {
      return;
    }

    while (drainWaiters.length > 0) {
      drainWaiters.pop()();
    }
  };

  const pump = () => {
    while (inFlight < maxInFlight && queued.length > 0) {
      const task = queued.shift();
      inFlight += 1;

      Promise.resolve()
        .then(task)
        .catch((error) => {
          onError?.(error instanceof Error ? error : new Error(String(error)));
        })
        .finally(() => {
          inFlight -= 1;
          pump();
          settleDrainWaiters();
        });
    }
  };

  return {
    size: () => queued.length,
    push(task) {
      queued.push(task);
      pump();
    },
    drain() {
      if (inFlight === 0 && queued.length === 0) {
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        drainWaiters.push(resolve);
      });
    },
  };
}
