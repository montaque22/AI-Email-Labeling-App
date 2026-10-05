import { requireSession } from "./session.js";

const backgroundTasksByUser = new Map();
const MAX_TASKS_PER_USER = 30;

function nowIso() {
  return new Date().toISOString();
}

function createTaskId(type) {
  return `${type}-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function getUserTasks(userId) {
  const existing = backgroundTasksByUser.get(userId);
  if (existing) {
    return existing;
  }
  const tasks = [];
  backgroundTasksByUser.set(userId, tasks);
  return tasks;
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

  const tasks = getUserTasks(userId);
  tasks.unshift(task);
  if (tasks.length > MAX_TASKS_PER_USER) {
    tasks.splice(MAX_TASKS_PER_USER);
  }
  return serializeTask(task);
}

export function updateBackgroundTask(userId, taskId, updates) {
  const task = getUserTasks(userId).find((candidate) => candidate.id === taskId);
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
  return getUserTasks(userId)
    .filter((task) => !task.dismissed)
    .map(serializeTask);
}

export function dismissBackgroundTasks(userId) {
  const tasks = getUserTasks(userId);
  for (const task of tasks) {
    if (task.status !== "running") {
      task.dismissed = true;
      task.updatedAt = nowIso();
    }
  }
  return listBackgroundTasks(userId);
}

export function registerBackgroundTaskRoutes(app) {
  app.get("/api/background-tasks", requireSession, (req, res) => {
    res.json({ tasks: listBackgroundTasks(req.user.id) });
  });

  app.delete("/api/background-tasks", requireSession, (req, res) => {
    res.json({ tasks: dismissBackgroundTasks(req.user.id) });
  });
}
