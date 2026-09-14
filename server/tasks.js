import crypto from "node:crypto";
import { dbPool } from "./db.js";
import { requireSession } from "./session.js";
import { callBestAvailableAi, cleanAiTextResponse } from "./byoai.js";
import { logSystemEvent } from "./system-logs.js";
import { compareTasksByEffectiveScore, computeEffectiveScore, DEFER_THRESHOLD } from "../shared/task-scoring.js";

const TITLE_MAX_LENGTH = 160;
const NOTES_MAX_LENGTH = 4000;
const PROJECT_MAX_LENGTH = 80;
const TAG_MAX_LENGTH = 40;
const MAX_TAGS = 12;
const DUPLICATE_SIMILARITY_THRESHOLD = 0.82;
const NUDGE_STEP_MAX_LENGTH = 500;

let taskWorkerStarted = false;

export async function ensureTasksTable() {
  if (!dbPool) {
    return;
  }

  await dbPool.query(`
    create table if not exists tasks (
      id uuid primary key,
      user_id text not null references "user"(id) on delete cascade,
      title text not null,
      notes text,
      tags jsonb not null default '[]'::jsonb,
      priority int not null default 2,
      due_date timestamptz,
      project text,
      defer_count int not null default 0,
      duplicate_count int not null default 0,
      source_email_id text,
      stuck boolean not null default false,
      nudge jsonb,
      completed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint tasks_priority_check check (priority in (1, 2, 3))
    )
  `);
  await dbPool.query("create index if not exists tasks_user_incomplete_idx on tasks(user_id, completed_at, created_at)");
  await dbPool.query("create index if not exists tasks_user_source_email_idx on tasks(user_id, source_email_id)");
}

export function registerTaskRoutes(app) {
  app.get("/api/tasks", requireSession, async (req, res) => {
    try {
      const tasks = await listTasks(req.user.id);
      res.json({ tasks, top3: tasks.slice(0, 3), deferThreshold: DEFER_THRESHOLD });
    } catch (error) {
      handleTaskError(res, error);
    }
  });

  app.get("/api/tasks/search", requireSession, async (req, res) => {
    try {
      const tasks = await searchTasks(req.user.id, {
        title: req.query.q,
        limit: req.query.limit,
      });
      res.json({ tasks });
    } catch (error) {
      handleTaskError(res, error);
    }
  });

  app.get("/api/tasks/:id", requireSession, async (req, res) => {
    try {
      const task = await getTask(req.user.id, req.params.id);
      if (!task) {
        res.status(404).json({ error: "Task not found" });
        return;
      }
      res.json({ task });
    } catch (error) {
      handleTaskError(res, error);
    }
  });

  app.post("/api/tasks", requireSession, async (req, res) => {
    try {
      const task = await createTask(req.user.id, req.body);
      res.status(201).json({ task });
    } catch (error) {
      handleTaskError(res, error);
    }
  });

  app.put("/api/tasks/:id", requireSession, async (req, res) => {
    try {
      const task = await updateTask(req.user.id, req.params.id, req.body);
      res.json({ task });
    } catch (error) {
      handleTaskError(res, error);
    }
  });

  app.delete("/api/tasks/:id", requireSession, async (req, res) => {
    try {
      await deleteTask(req.user.id, req.params.id);
      res.json({ ok: true });
    } catch (error) {
      handleTaskError(res, error);
    }
  });

  app.post("/api/tasks/:id/complete", requireSession, async (req, res) => {
    try {
      const task = await completeTask(req.user.id, req.params.id);
      res.json({ task });
    } catch (error) {
      handleTaskError(res, error);
    }
  });

  app.post("/api/tasks/:id/defer", requireSession, async (req, res) => {
    try {
      const task = await deferTask(req.user.id, req.params.id);
      res.json({ task });
    } catch (error) {
      handleTaskError(res, error);
    }
  });

  app.post("/api/tasks/:id/nudge/generate", requireSession, async (req, res) => {
    try {
      const task = await generateNudgeSteps(req.user.id, req.params.id);
      res.json({ task });
    } catch (error) {
      handleTaskError(res, error);
    }
  });

  app.post("/api/tasks/:id/nudge/simplify", requireSession, async (req, res) => {
    try {
      const task = await simplifyNudgeStep(req.user.id, req.params.id);
      res.json({ task });
    } catch (error) {
      handleTaskError(res, error);
    }
  });

  app.post("/api/tasks/:id/nudge/complete-step", requireSession, async (req, res) => {
    try {
      const task = await completeNudgeStep(req.user.id, req.params.id);
      res.json({ task });
    } catch (error) {
      handleTaskError(res, error);
    }
  });
}

export async function listTasks(userId, { includeCompleted = false, limit = 500 } = {}) {
  ensureDatabase();
  const result = await dbPool.query(
    `
      select *
      from tasks
      where user_id = $1
        and ($2::boolean = true or completed_at is null)
      order by created_at asc
      limit $3
    `,
    [userId, includeCompleted, parseLimit(limit, 500)],
  );

  return result.rows.map(mapTaskRow).sort(compareTasksByEffectiveScore);
}

export async function getTask(userId, taskId) {
  ensureDatabase();
  const result = await dbPool.query("select * from tasks where user_id = $1 and id = $2", [userId, taskId]);
  return result.rows[0] ? mapTaskRow(result.rows[0]) : null;
}

export async function createTask(userId, payload) {
  ensureDatabase();
  const input = parseTaskPayload(payload);
  const result = await dbPool.query(
    `
      insert into tasks (id, user_id, title, notes, tags, priority, due_date, project, source_email_id)
      values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
      returning *
    `,
    [
      crypto.randomUUID(),
      userId,
      input.title,
      input.notes,
      JSON.stringify(input.tags),
      input.priority,
      input.dueDate,
      input.project,
      input.sourceEmailId,
    ],
  );

  const task = mapTaskRow(result.rows[0]);
  await logTaskEvent(userId, "task.created", "success", { task });
  return task;
}

export async function createTaskFromWorkflow(userId, payload) {
  const input = parseTaskPayload(payload);
  const duplicate = await findBestDuplicateTask(userId, input.title);
  if (duplicate && duplicate.similarity >= DUPLICATE_SIMILARITY_THRESHOLD) {
    const result = await dbPool.query(
      `
        update tasks
        set duplicate_count = duplicate_count + 1,
            updated_at = now()
        where user_id = $1 and id = $2
        returning *
      `,
      [userId, duplicate.task.id],
    );
    const task = mapTaskRow(result.rows[0]);
    await logTaskEvent(userId, "task.duplicate_detected", "success", {
      requestedTitle: input.title,
      task,
      similarity: duplicate.similarity,
    });
    return { task, duplicate: true, similarity: duplicate.similarity };
  }

  return { task: await createTask(userId, input), duplicate: false, similarity: duplicate?.similarity ?? 0 };
}

export async function updateTask(userId, taskId, payload) {
  ensureDatabase();
  const existing = await getTask(userId, taskId);
  if (!existing) {
    throw httpError("Task not found", 404);
  }
  if (existing.completedAt) {
    throw httpError("Completed tasks cannot be edited.", 400);
  }

  const input = parseTaskPayload({ ...existing, ...payload }, { partial: false });
  const result = await dbPool.query(
    `
      update tasks
      set title = $3,
          notes = $4,
          tags = $5::jsonb,
          priority = $6,
          due_date = $7,
          project = $8,
          source_email_id = $9,
          updated_at = now()
      where user_id = $1 and id = $2
      returning *
    `,
    [
      userId,
      taskId,
      input.title,
      input.notes,
      JSON.stringify(input.tags),
      input.priority,
      input.dueDate,
      input.project,
      input.sourceEmailId,
    ],
  );
  if (!result.rows[0]) {
    throw httpError("Task not found", 404);
  }
  const task = mapTaskRow(result.rows[0]);
  await logTaskEvent(userId, "task.updated", "success", { task });
  return task;
}

export async function deleteTask(userId, taskId) {
  ensureDatabase();
  const result = await dbPool.query("delete from tasks where user_id = $1 and id = $2 returning *", [userId, taskId]);
  if (!result.rows[0]) {
    throw httpError("Task not found", 404);
  }
  await logTaskEvent(userId, "task.deleted", "success", { task: mapTaskRow(result.rows[0]) });
}

export async function completeTask(userId, taskId) {
  ensureDatabase();
  const result = await dbPool.query(
    `
      update tasks
      set completed_at = coalesce(completed_at, now()),
          updated_at = now()
      where user_id = $1 and id = $2
      returning *
    `,
    [userId, taskId],
  );
  if (!result.rows[0]) {
    throw httpError("Task not found", 404);
  }
  const task = mapTaskRow(result.rows[0]);
  await logTaskEvent(userId, "task.completed", "success", { task });
  return task;
}

export async function deferTask(userId, taskId) {
  ensureDatabase();
  const result = await dbPool.query(
    `
      update tasks
      set defer_count = defer_count + 1,
          stuck = case when defer_count + 1 >= $3 then true else stuck end,
          updated_at = now()
      where user_id = $1 and id = $2 and completed_at is null
      returning *
    `,
    [userId, taskId, DEFER_THRESHOLD],
  );
  if (!result.rows[0]) {
    throw httpError("Task not found", 404);
  }
  let task = mapTaskRow(result.rows[0]);
  if (task.deferCount >= DEFER_THRESHOLD) {
    try {
      task = await generateNudgeSteps(userId, task.id);
    } catch (error) {
      await logTaskEvent(userId, "task.nudge_generation_failed", "error", { taskId: task.id, error: error.message });
    }
  }
  await logTaskEvent(userId, "task.deferred", "success", { task });
  return task;
}

export async function searchTasks(userId, payload = {}) {
  ensureDatabase();
  const query = String(payload.title ?? payload.query ?? "").trim();
  if (!query) {
    return [];
  }

  const tasks = await listTasks(userId, { includeCompleted: false, limit: 1000 });
  return tasks
    .map((task) => ({ task, similarity: titleSimilarity(query, task.title) }))
    .filter((match) => match.similarity > 0.35)
    .sort((left, right) => right.similarity - left.similarity || compareTasksByEffectiveScore(left.task, right.task))
    .slice(0, parseLimit(payload.limit, 5, 5))
    .map((match) => ({ ...match.task, similarity: match.similarity }));
}

export async function generateNudgeSteps(userId, taskIdOrTask) {
  ensureDatabase();
  const task = typeof taskIdOrTask === "string" ? await getTask(userId, taskIdOrTask) : taskIdOrTask;
  if (!task) {
    throw httpError("Task not found", 404);
  }

  const aiResponse = await callBestAvailableAi(userId, {
    systemPrompt:
      "You help users get unstuck on deferred tasks. Return only valid JSON with a steps array of 3 to 5 short concrete actions. Each step should be easy to do in 10 minutes or less.",
    userPrompt: [
      `Task title: ${task.title}`,
      `Notes: ${task.notes || "none"}`,
      `Project: ${task.project || "none"}`,
      `Tags: ${task.tags.length ? task.tags.join(", ") : "none"}`,
      `Due date: ${task.dueDate || "none"}`,
      `Deferred ${task.deferCount} time(s).`,
    ].join("\n"),
    responseShape: "task_nudge",
    responseSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        steps: {
          type: "array",
          minItems: 3,
          maxItems: 5,
          items: {
            type: "string",
            maxLength: NUDGE_STEP_MAX_LENGTH,
          },
        },
      },
      required: ["steps"],
    },
  });
  const parsed = parseAiJson(aiResponse, ["steps"]);
  const steps = normalizeNudgeSteps(parsed.steps);
  const nudge = { steps, currentStepIndex: 0, generatedAt: new Date().toISOString() };
  const result = await dbPool.query(
    `
      update tasks
      set stuck = true,
          nudge = $3::jsonb,
          updated_at = now()
      where user_id = $1 and id = $2
      returning *
    `,
    [userId, task.id, JSON.stringify(nudge)],
  );
  return mapTaskRow(result.rows[0]);
}

export async function simplifyNudgeStep(userId, taskId) {
  ensureDatabase();
  const task = await getTask(userId, taskId);
  if (!task) {
    throw httpError("Task not found", 404);
  }
  const nudge = normalizeNudge(task.nudge);
  const currentStep = nudge.steps[nudge.currentStepIndex] ?? nudge.steps[0];
  if (!currentStep) {
    return generateNudgeSteps(userId, task);
  }

  const aiResponse = await callBestAvailableAi(userId, {
    systemPrompt: "Rewrite task steps so they are simpler and more concrete. Return only the simplified step text.",
    userPrompt: `Task: ${task.title}\nCurrent step: ${currentStep}\nMake this one step easier and more specific.`,
    responseShape: "task_nudge_simplify",
  });
  const simplified = cleanAiTextResponse(aiResponse).slice(0, NUDGE_STEP_MAX_LENGTH);
  nudge.steps[nudge.currentStepIndex] = simplified || currentStep;
  nudge.simplifiedAt = new Date().toISOString();

  const result = await dbPool.query(
    `
      update tasks
      set nudge = $3::jsonb,
          updated_at = now()
      where user_id = $1 and id = $2
      returning *
    `,
    [userId, taskId, JSON.stringify(nudge)],
  );
  return mapTaskRow(result.rows[0]);
}

export async function completeNudgeStep(userId, taskId) {
  ensureDatabase();
  const task = await getTask(userId, taskId);
  if (!task) {
    throw httpError("Task not found", 404);
  }
  const nudge = normalizeNudge(task.nudge);
  if (!nudge.steps.length) {
    return task;
  }

  nudge.currentStepIndex = Math.min(nudge.currentStepIndex + 1, nudge.steps.length);
  const isDone = nudge.currentStepIndex >= nudge.steps.length;
  const result = await dbPool.query(
    `
      update tasks
      set stuck = $3,
          nudge = $4::jsonb,
          updated_at = now()
      where user_id = $1 and id = $2
      returning *
    `,
    [userId, taskId, isDone ? false : task.stuck, JSON.stringify(isDone ? { ...nudge, completedAt: new Date().toISOString() } : nudge)],
  );
  return mapTaskRow(result.rows[0]);
}

export async function runTaskMidnightRefresh() {
  if (!dbPool) {
    return;
  }

  const users = await dbPool.query("select distinct user_id from tasks where completed_at is null");
  for (const row of users.rows) {
    const userId = row.user_id;
    const tasks = await listTasks(userId);
    const top3 = tasks.slice(0, 3);
    for (const task of top3) {
      try {
        if (task.deferCount >= DEFER_THRESHOLD) {
          await generateNudgeSteps(userId, task);
        } else if (task.stuck || task.nudge) {
          await dbPool.query(
            "update tasks set stuck = false, nudge = null, updated_at = now() where user_id = $1 and id = $2",
            [userId, task.id],
          );
        }
      } catch (error) {
        await logTaskEvent(userId, "task.midnight_refresh_failed", "error", { taskId: task.id, error: error.message });
      }
    }
  }
}

export function startTaskMidnightWorker() {
  if (taskWorkerStarted) {
    return;
  }
  taskWorkerStarted = true;

  const scheduleNext = () => {
    const delay = millisecondsUntilNextMidnight();
    setTimeout(async () => {
      try {
        await runTaskMidnightRefresh();
      } catch (error) {
        console.error("Task midnight refresh failed:", error);
      } finally {
        scheduleNext();
      }
    }, delay).unref?.();
  };

  scheduleNext();
}

function parseTaskPayload(payload = {}) {
  const title = String(payload.title ?? "").trim();
  if (!title) {
    throw httpError("title is required", 400);
  }
  if (title.length > TITLE_MAX_LENGTH) {
    throw httpError(`title must be ${TITLE_MAX_LENGTH} characters or less`, 400);
  }

  const notes = typeof payload.notes === "string" && payload.notes.trim() ? payload.notes.trim().slice(0, NOTES_MAX_LENGTH) : null;
  const priority = Number(payload.priority ?? 2);
  if (![1, 2, 3].includes(priority)) {
    throw httpError("priority must be 1, 2, or 3", 400);
  }

  const dueDate = normalizeDate(payload.dueDate ?? payload.due_date);
  const project = typeof payload.project === "string" && payload.project.trim() ? payload.project.trim().slice(0, PROJECT_MAX_LENGTH) : null;
  const sourceEmailId = typeof payload.sourceEmailId === "string" && payload.sourceEmailId.trim()
    ? payload.sourceEmailId.trim().slice(0, 255)
    : typeof payload.source_email_id === "string" && payload.source_email_id.trim()
      ? payload.source_email_id.trim().slice(0, 255)
      : null;

  return {
    title,
    notes,
    tags: normalizeTags(payload.tags),
    priority,
    dueDate,
    project,
    sourceEmailId,
  };
}

function normalizeTags(value) {
  const rawTags = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return [...new Set(rawTags.map((tag) => String(tag).trim()).filter(Boolean).map((tag) => tag.slice(0, TAG_MAX_LENGTH)))]
    .slice(0, MAX_TAGS);
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw httpError("dueDate must be a valid date", 400);
  }
  return date.toISOString();
}

function mapTaskRow(row) {
  const task = {
    id: row.id,
    title: row.title,
    notes: row.notes ?? "",
    tags: normalizeJsonArray(row.tags),
    priority: Number(row.priority),
    dueDate: row.due_date ? new Date(row.due_date).toISOString() : null,
    project: row.project ?? "",
    deferCount: Number(row.defer_count ?? 0),
    duplicateCount: Number(row.duplicate_count ?? 0),
    sourceEmailId: row.source_email_id ?? "",
    stuck: Boolean(row.stuck),
    nudge: normalizeNudge(row.nudge),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  };
  return { ...task, effectiveScore: computeEffectiveScore(task) };
}

function normalizeJsonArray(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string");
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeNudge(value) {
  const nudge = typeof value === "string" ? safeJsonParse(value) : value;
  if (!nudge || typeof nudge !== "object") {
    return { steps: [], currentStepIndex: 0 };
  }
  return {
    ...nudge,
    steps: normalizeNudgeSteps(nudge.steps),
    currentStepIndex: Number.isInteger(nudge.currentStepIndex) ? nudge.currentStepIndex : 0,
  };
}

function normalizeNudgeSteps(value) {
  return Array.isArray(value)
    ? value.map((step) => String(step).trim()).filter(Boolean).map((step) => step.slice(0, NUDGE_STEP_MAX_LENGTH)).slice(0, 8)
    : [];
}

async function findBestDuplicateTask(userId, title) {
  const matches = await searchTasks(userId, { title, limit: 5 });
  return matches[0] ? { task: matches[0], similarity: matches[0].similarity ?? 0 } : null;
}

function titleSimilarity(left, right) {
  const a = normalizeSearchText(left);
  const b = normalizeSearchText(right);
  if (!a || !b) {
    return 0;
  }
  if (a === b) {
    return 1;
  }

  const distance = levenshteinDistance(a, b);
  const maxLength = Math.max(a.length, b.length);
  return maxLength === 0 ? 0 : 1 - distance / maxLength;
}

function normalizeSearchText(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function levenshteinDistance(left, right) {
  const costs = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = i - 1;
    costs[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const current = costs[j];
      costs[j] = left[i - 1] === right[j - 1]
        ? previous
        : Math.min(previous + 1, costs[j] + 1, costs[j - 1] + 1);
      previous = current;
    }
  }
  return costs[right.length];
}

function parseAiJson(value, requiredKeys = []) {
  const text = cleanAiTextResponse(value).replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw httpError("AI returned an invalid nudge response.", 502);
  }
  for (const key of requiredKeys) {
    if (!(key in parsed)) {
      throw httpError(`AI nudge response is missing ${key}.`, 502);
    }
  }
  return parsed;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseLimit(value, fallback, max = 500) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function millisecondsUntilNextMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}

async function logTaskEvent(userId, eventName, status, payload) {
  await logSystemEvent(userId, {
    category: "tasks",
    eventName,
    status,
    message: eventName.replace(/\./g, " "),
    payload,
  });
}

function ensureDatabase() {
  if (!dbPool) {
    throw httpError("Database is not configured.", 503);
  }
}

function httpError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function handleTaskError(res, error) {
  console.error("Task request failed:", error);
  res.status(error.status || 500).json({ error: error.message || "Task request failed" });
}
