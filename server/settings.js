import { dbPool } from "./db.js";
import { requireSession } from "./session.js";

const DEFAULT_CONFIDENCE_THRESHOLD = 0.9;
export const DEFAULT_USER_TIMEZONE = "America/Los_Angeles";

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
  await dbPool.query("alter table user_settings add column if not exists webhook_url text");
  await dbPool.query("alter table user_settings add column if not exists webhook_bearer_token text");
  await dbPool.query("alter table user_settings add column if not exists timezone text not null default 'America/Los_Angeles'");
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

  app.get("/api/settings/webhook", requireSession, async (req, res) => {
    try {
      const settings = await getWebhookSettings(req.user.id);
      res.json(settings);
    } catch (error) {
      handleDbError(res, error);
    }
  });

  app.put("/api/settings/webhook", requireSession, async (req, res) => {
    const input = parseWebhookSettings(req.body);

    if (!input.ok) {
      res.status(400).json({ error: input.error });
      return;
    }

    try {
      const settings = await updateWebhookSettings(req.user.id, input.settings);
      res.json(settings);
    } catch (error) {
      handleDbError(res, error);
    }
  });

  app.get("/api/settings/system", requireSession, async (req, res) => {
    try {
      res.json(await getSystemSettings(req.user.id));
    } catch (error) {
      handleDbError(res, error);
    }
  });

  app.put("/api/settings/system", requireSession, async (req, res) => {
    const input = parseSystemSettings(req.body);

    if (!input.ok) {
      res.status(400).json({ error: input.error });
      return;
    }

    try {
      res.json(await updateSystemSettings(req.user.id, input.settings));
    } catch (error) {
      handleDbError(res, error);
    }
  });
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

function parseWebhookSettings(body) {
  const webhookUrl = typeof body?.webhookUrl === "string" ? body.webhookUrl.trim() : "";
  const bearerToken = typeof body?.bearerToken === "string" ? body.bearerToken.trim() : "";

  if (webhookUrl) {
    try {
      const url = new URL(webhookUrl);
      if (!["http:", "https:"].includes(url.protocol)) {
        return { ok: false, error: "Webhook URL must use http or https" };
      }
    } catch {
      return { ok: false, error: "Webhook URL must be a valid URL" };
    }
  }

  if (bearerToken.length > 2000) {
    return { ok: false, error: "Bearer token must be 2000 characters or less" };
  }

  return {
    ok: true,
    settings: {
      webhookUrl: webhookUrl || null,
      bearerToken: bearerToken || null,
    },
  };
}

function parseSystemSettings(body) {
  const timezone = typeof body?.timezone === "string" ? body.timezone.trim() : "";

  if (!isValidTimeZone(timezone)) {
    return { ok: false, error: "Choose a valid timezone" };
  }

  return {
    ok: true,
    settings: { timezone },
  };
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

export async function getUserTimezone(userId) {
  const settings = await getSystemSettings(userId);
  return settings.timezone;
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

async function getWebhookSettings(userId) {
  const result = await dbPool.query(
    `
      insert into user_settings (user_id, confidence_threshold)
      values ($1, $2)
      on conflict (user_id) do nothing
      returning webhook_url as "webhookUrl",
                webhook_bearer_token as "bearerToken"
    `,
    [userId, DEFAULT_CONFIDENCE_THRESHOLD],
  );

  if (result.rows[0]) {
    return normalizeWebhookSettings(result.rows[0]);
  }

  const existing = await dbPool.query(
    `
      select webhook_url as "webhookUrl",
             webhook_bearer_token as "bearerToken"
      from user_settings
      where user_id = $1
    `,
    [userId],
  );

  return normalizeWebhookSettings(existing.rows[0] ?? {});
}

async function updateWebhookSettings(userId, settings) {
  const result = await dbPool.query(
    `
      insert into user_settings (user_id, confidence_threshold, webhook_url, webhook_bearer_token)
      values ($1, $2, $3, $4)
      on conflict (user_id) do update
      set webhook_url = excluded.webhook_url,
          webhook_bearer_token = excluded.webhook_bearer_token,
          updated_at = now()
      returning webhook_url as "webhookUrl",
                webhook_bearer_token as "bearerToken"
    `,
    [userId, DEFAULT_CONFIDENCE_THRESHOLD, settings.webhookUrl, settings.bearerToken],
  );

  return normalizeWebhookSettings(result.rows[0]);
}

function normalizeWebhookSettings(settings) {
  return {
    webhookUrl: settings.webhookUrl ?? "",
    bearerToken: settings.bearerToken ?? "",
  };
}

async function getSystemSettings(userId) {
  const result = await dbPool.query(
    `
      insert into user_settings (user_id, confidence_threshold, timezone)
      values ($1, $2, $3)
      on conflict (user_id) do nothing
      returning timezone
    `,
    [userId, DEFAULT_CONFIDENCE_THRESHOLD, DEFAULT_USER_TIMEZONE],
  );

  if (result.rows[0]) {
    return normalizeSystemSettings(result.rows[0]);
  }

  const existing = await dbPool.query("select timezone from user_settings where user_id = $1", [userId]);
  return normalizeSystemSettings(existing.rows[0] ?? {});
}

async function updateSystemSettings(userId, settings) {
  const result = await dbPool.query(
    `
      insert into user_settings (user_id, confidence_threshold, timezone)
      values ($1, $2, $3)
      on conflict (user_id) do update
      set timezone = excluded.timezone,
          updated_at = now()
      returning timezone
    `,
    [userId, DEFAULT_CONFIDENCE_THRESHOLD, settings.timezone],
  );

  return normalizeSystemSettings(result.rows[0]);
}

function normalizeSystemSettings(settings) {
  return {
    timezone: isValidTimeZone(settings.timezone) ? settings.timezone : DEFAULT_USER_TIMEZONE,
  };
}

function isValidTimeZone(timezone) {
  if (!timezone) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function handleDbError(res, error) {
  console.error("Settings API failed:", error);
  res.status(500).json({ error: "Settings request failed" });
}
