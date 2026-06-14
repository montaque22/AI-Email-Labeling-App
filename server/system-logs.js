import { dbPool } from "./db.js";
import crypto from "node:crypto";

export async function ensureSystemLogsTable() {
  if (!dbPool) {
    return;
  }

  await dbPool.query(`
    create table if not exists system_logs (
      id uuid primary key,
      user_id text not null references "user"(id) on delete cascade,
      category text not null,
      event_name text not null,
      status text not null default 'info',
      message text not null,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )
  `);
  await dbPool.query("create index if not exists system_logs_user_id_idx on system_logs(user_id, created_at desc)");
  await dbPool.query("create index if not exists system_logs_category_idx on system_logs(user_id, category, created_at desc)");
}

export async function logSystemEvent(userId, { category, eventName, status = "info", message, payload = {} }) {
  if (!dbPool || !userId) {
    return;
  }

  try {
    await dbPool.query(
      `
        insert into system_logs (id, user_id, category, event_name, status, message, payload)
        values ($1, $2, $3, $4, $5, $6, $7::jsonb)
      `,
      [
        crypto.randomUUID(),
        userId,
        normalizeCategory(category),
        String(eventName || "event").slice(0, 120),
        normalizeStatus(status),
        String(message || "System event").slice(0, 500),
        JSON.stringify(redactSensitivePayload(payload)),
      ],
    );
  } catch (error) {
    console.warn("System log write failed:", error.message);
  }
}

export async function listSystemLogs(userId, { category = "all", limit = 100 } = {}) {
  const values = [userId];
  const conditions = ["user_id = $1"];
  const normalizedCategory = normalizeCategory(category);

  if (normalizedCategory !== "all") {
    values.push(normalizedCategory);
    conditions.push(`category = $${values.length}`);
  }

  values.push(Math.min(Math.max(Number(limit) || 100, 1), 200));

  const result = await dbPool.query(
    `
      select id, category, event_name as "eventName", status, message, payload, created_at as "createdAt"
      from system_logs
      where ${conditions.join(" and ")}
      order by created_at desc
      limit $${values.length}
    `,
    values,
  );

  return result.rows;
}

function normalizeCategory(category) {
  const value = String(category || "all").toLowerCase();
  if (["ai", "endpoints", "webhook", "mcp-server", "all"].includes(value)) {
    return value;
  }
  if (value === "webhook events") {
    return "webhook";
  }
  if (value === "mcp") {
    return "mcp-server";
  }
  return "all";
}

function normalizeStatus(status) {
  const value = String(status || "info").toLowerCase();
  return ["success", "error", "warning", "info"].includes(value) ? value : "info";
}

function redactSensitivePayload(value) {
  if (Array.isArray(value)) {
    return value.map(redactSensitivePayload);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (/token|secret|key|authorization|password/i.test(key)) {
        return [key, "[redacted]"];
      }
      return [key, redactSensitivePayload(entry)];
    }),
  );
}
