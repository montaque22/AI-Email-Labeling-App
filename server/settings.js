import { auth } from "./auth.js";
import { dbPool } from "./db.js";

const DEFAULT_CONFIDENCE_THRESHOLD = 0.9;

export async function ensureSettingsTable() {
  if (!dbPool) {
    return;
  }

  await dbPool.query(`
    create table if not exists user_settings (
      user_id text primary key references "user"(id) on delete cascade,
      confidence_threshold numeric(3, 2) not null default 0.90,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint confidence_threshold_bounds check (
        confidence_threshold >= 0.01 and confidence_threshold <= 1.00
      )
    )
  `);
}

export function registerSettingsRoutes(app) {
  app.get("/api/settings/confidence-threshold", requireSession, async (req, res) => {
    try {
      const threshold = await getConfidenceThreshold(req.user.id);
      res.json({ threshold });
    } catch (error) {
      handleDbError(res, error);
    }
  });

  app.put("/api/settings/confidence-threshold", requireSession, async (req, res) => {
    const input = parseThreshold(req.body?.threshold);

    if (!input.ok) {
      res.status(400).json({ error: input.error });
      return;
    }

    try {
      const threshold = await updateConfidenceThreshold(req.user.id, input.threshold);
      res.json({ threshold });
    } catch (error) {
      handleDbError(res, error);
    }
  });
}

async function requireSession(req, res, next) {
  const session = await auth.api.getSession({
    headers: toWebHeaders(req.headers),
  });

  if (!session?.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  req.user = session.user;
  next();
}

function toWebHeaders(headers) {
  const webHeaders = new Headers();

  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        webHeaders.append(key, item);
      }
    } else if (value !== undefined) {
      webHeaders.set(key, value);
    }
  }

  return webHeaders;
}

function parseThreshold(value) {
  const threshold = Number(value);

  if (!Number.isFinite(threshold)) {
    return { ok: false, error: "Confidence threshold must be a number" };
  }

  if (threshold < 0.01 || threshold > 1) {
    return { ok: false, error: "Confidence threshold must be between 0.01 and 1" };
  }

  return { ok: true, threshold: Number(threshold.toFixed(2)) };
}

export async function getConfidenceThreshold(userId) {
  const result = await dbPool.query(
    `
      insert into user_settings (user_id, confidence_threshold)
      values ($1, $2)
      on conflict (user_id) do nothing
      returning confidence_threshold
    `,
    [userId, DEFAULT_CONFIDENCE_THRESHOLD],
  );

  if (result.rows[0]) {
    return Number(result.rows[0].confidence_threshold);
  }

  const existing = await dbPool.query("select confidence_threshold from user_settings where user_id = $1", [userId]);
  return Number(existing.rows[0]?.confidence_threshold ?? DEFAULT_CONFIDENCE_THRESHOLD);
}

async function updateConfidenceThreshold(userId, threshold) {
  const result = await dbPool.query(
    `
      insert into user_settings (user_id, confidence_threshold)
      values ($1, $2)
      on conflict (user_id) do update
      set confidence_threshold = excluded.confidence_threshold,
          updated_at = now()
      returning confidence_threshold
    `,
    [userId, threshold],
  );

  return Number(result.rows[0].confidence_threshold);
}

function handleDbError(res, error) {
  console.error("Settings API failed:", error);
  res.status(500).json({ error: "Settings request failed" });
}
