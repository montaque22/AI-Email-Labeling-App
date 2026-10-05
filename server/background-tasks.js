import { requireSession } from "./session.js";

// In-memory on purpose. A background task carries no state that is not already durable
// somewhere else: a rule review's real outcome lives in `email_rules.metadata.providerApply`,
// a poll's outcome lives in the email index and the system log. The task record is only the
// progress indicator for the tab that started it, so persisting it would buy a progress bar
// for a session that no longer exists while adding a table, a writer on every tick, and a
// retention sweep. The cost of not persisting is that a restart drops in-flight tasks — the
// drawer handles that by rendering a task that disappears as "interrupted" instead of letting
// it vanish, so the user is never told a task finished when it did not.
//
// The consequence worth naming: this is single-instance only. Two instances behind a
// non-sticky load balancer would show each tab a different half of its own tasks.
const backgroundTasksByUser = new Map();
const MAX_TASKS_PER_USER = 30;
// How long a finished task stays readable before it is swept. Long enough that a user who
// walks away mid-sync still sees the result on return, short enough that an idle process does
// not hold a task list for every user who ever logged in.
const FINISHED_TASK_TTL_MS = 30 * 60 * 1000;
// Backstop for a task that is wedged at "running" — a detached body that died without
// reaching its own error handling. Without this, one such task pins its user's entry for the
// process lifetime. Set far above any real task: a manual poll ticks `updatedAt` per email
// and a rule apply is one provider round-trip, so nothing legitimate goes this long silent.
const STALE_RUNNING_TASK_TTL_MS = 6 * 60 * 60 * 1000;
// Returned for users with no tasks so pure reads never allocate a map entry.
const NO_TASKS = Object.freeze([]);

function nowIso() {
  return new Date().toISOString();
}

function createTaskId(type) {
  return `${type}-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/**
 * Read-only lookup. Never creates an entry, so polling `GET /api/background-tasks` for a user
 * who has no tasks — which is the steady state for every idle tab, every 2500ms — leaves the
 * map untouched.
 *
 * @param {string} userId
 * @returns {Array<object>}
 */
function peekUserTasks(userId) {
  return backgroundTasksByUser.get(userId) ?? NO_TASKS;
}

/**
 * Write path lookup: creates the entry, because the caller is about to put a task in it.
 *
 * @param {string} userId
 * @returns {Array<object>}
 */
function ensureUserTasks(userId) {
  const existing = backgroundTasksByUser.get(userId);
  if (existing) {
    return existing;
  }

  const tasks = [];
  backgroundTasksByUser.set(userId, tasks);
  return tasks;
}

/**
 * Drops finished tasks past their TTL and evicts users left with nothing.
 *
 * Called from the read and create paths rather than from a timer: those are the only moments
 * the map can grow, and sweeping there keeps the store self-limiting without a background
 * worker that would hold the process awake.
 *
 * @param {string} userId
 * @returns {void}
 */
function pruneUserTasks(userId) {
  const tasks = backgroundTasksByUser.get(userId);
  if (!tasks) {
    return;
  }

  const now = Date.now();
  const kept = tasks.filter((task) => {
    const updatedAt = Date.parse(task.updatedAt);
    if (task.status === "running") {
      return !Number.isFinite(updatedAt) || now - updatedAt < STALE_RUNNING_TASK_TTL_MS;
    }
    if (task.dismissed) {
      return false;
    }
    return Number.isFinite(updatedAt) && now - updatedAt < FINISHED_TASK_TTL_MS;
  });

  if (kept.length === 0) {
    backgroundTasksByUser.delete(userId);
    return;
  }

  if (kept.length !== tasks.length) {
    tasks.splice(0, tasks.length, ...kept);
  }
}

function serializeTask(task) {
  return {
    id: task.id,
    type: task.type,
    title: task.title,
    message: task.message,
    status: task.status,
    total: task.total,
    completed: task.completed,
    failed: task.failed,
    errors: task.errors,
    description: task.description,
    result: task.result,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    dismissed: task.dismissed,
  };
}

export function createBackgroundTask(userId, { type, title, message = "", total = 0 }) {
  const timestamp = nowIso();
  const task = {
    id: createTaskId(type),
    type,
    title,
    message,
    status: "running",
    total,
    completed: 0,
    failed: 0,
    errors: [],
    description: "",
    result: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    dismissed: false,
  };

  pruneUserTasks(userId);
  const tasks = ensureUserTasks(userId);
  tasks.unshift(task);
  if (tasks.length > MAX_TASKS_PER_USER) {
    tasks.splice(MAX_TASKS_PER_USER);
  }
  return serializeTask(task);
}

export function updateBackgroundTask(userId, taskId, updates) {
  const task = peekUserTasks(userId).find((candidate) => candidate.id === taskId);
  if (!task) {
    return null;
  }

  Object.assign(task, updates, { updatedAt: nowIso() });
  return serializeTask(task);
}

export function completeBackgroundTask(userId, taskId, { message = "Background task complete.", result = null } = {}) {
  return updateBackgroundTask(userId, taskId, {
    status: "success",
    message,
    result,
  });
}

export function failBackgroundTask(userId, taskId, error, { message = "Background task failed." } = {}) {
  const errorMessage = error instanceof Error ? error.message : String(error || "Unknown error");
  return updateBackgroundTask(userId, taskId, {
    status: "error",
    message,
    errors: [{ message: errorMessage }],
  });
}

export function warnBackgroundTask(userId, taskId, warning, { message = "Background task needs attention.", description = "" } = {}) {
  const warningMessage = warning instanceof Error ? warning.message : String(warning || "Warning");
  return updateBackgroundTask(userId, taskId, {
    status: "warning",
    message,
    description,
    errors: [{ message: warningMessage, description }],
  });
}

export function listBackgroundTasks(userId) {
  pruneUserTasks(userId);
  return peekUserTasks(userId)
    .filter((task) => !task.dismissed)
    .map(serializeTask);
}

export function dismissBackgroundTasks(userId) {
  for (const task of peekUserTasks(userId)) {
    if (task.status !== "running") {
      task.dismissed = true;
      task.updatedAt = nowIso();
    }
  }

  // Prunes the tasks just dismissed — nothing reads a dismissed task again — and evicts the
  // user outright when no task is still running.
  return listBackgroundTasks(userId);
}

/**
 * Users currently holding task state. Exported for the leak check in the manual test; the
 * routes never need it.
 *
 * @returns {number}
 */
export function countTrackedBackgroundTaskUsers() {
  return backgroundTasksByUser.size;
}

export function registerBackgroundTaskRoutes(app) {
  app.get("/api/background-tasks", requireSession, (req, res) => {
    res.json({ tasks: listBackgroundTasks(req.user.id) });
  });

  app.delete("/api/background-tasks", requireSession, (req, res) => {
    res.json({ tasks: dismissBackgroundTasks(req.user.id) });
  });
}
