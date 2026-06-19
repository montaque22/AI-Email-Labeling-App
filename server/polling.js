import { generateAiLabel, isAiActiveForUser } from "./byoai.js";
import { dbPool } from "./db.js";
import { searchPollingCandidates } from "./integrations.js";
import { requireSession } from "./session.js";

const POLLING_WORKER_INTERVAL_MS = 60_000;
const activePollingUsers = new Set();
let pollingTimer = null;

export async function ensurePollingSettings() {
  if (!dbPool) {
    return;
  }

  await dbPool.query("alter table user_settings add column if not exists polling_enabled boolean not null default false");
  await dbPool.query("alter table user_settings add column if not exists polling_interval_minutes integer not null default 15");
  await dbPool.query("alter table user_settings add column if not exists polling_lookback_value integer not null default 24");
  await dbPool.query("alter table user_settings add column if not exists polling_lookback_unit text not null default 'hours'");
  await dbPool.query("alter table user_settings add column if not exists polling_last_run_at timestamptz");
  await dbPool.query(`
    do $$
    begin
      if not exists (select 1 from pg_constraint where conname = 'user_settings_polling_interval_bounds') then
        alter table user_settings add constraint user_settings_polling_interval_bounds
          check (polling_interval_minutes between 10 and 720);
      end if;
      if not exists (select 1 from pg_constraint where conname = 'user_settings_polling_lookback_bounds') then
        alter table user_settings add constraint user_settings_polling_lookback_bounds
          check (
            (polling_lookback_unit = 'hours' and polling_lookback_value between 1 and 168)
            or (polling_lookback_unit = 'days' and polling_lookback_value between 1 and 7)
          );
      end if;
    end $$;
  `);
}

export function registerPollingRoutes(app) {
  app.get("/api/email-accounts/polling", requireSession, async (req, res) => {
    try {
      res.json(await getPollingSettings(req.user.id));
    } catch (error) {
      handlePollingError(res, error);
    }
  });

  app.put("/api/email-accounts/polling", requireSession, async (req, res) => {
    const input = parsePollingSettings(req.body);
    if (!input.ok) {
      res.status(400).json({ error: input.error });
      return;
    }

    try {
      const aiActive = await isAiActiveForUser(req.user.id);
      if (input.settings.enabled && !aiActive) {
        res.status(400).json({ error: "Activate AI with a connected platform before enabling polling." });
        return;
      }
      res.json(await savePollingSettings(req.user.id, { ...input.settings, enabled: input.settings.enabled && aiActive }));
    } catch (error) {
      handlePollingError(res, error);
    }
  });
}

export function startPollingWorker() {
  if (!dbPool || pollingTimer) {
    return;
  }

  const run = () => void pollDueUsers().catch((error) => console.error("Polling worker failed:", error));
  const initialTimer = setTimeout(run, 10_000);
  initialTimer.unref?.();
  pollingTimer = setInterval(run, POLLING_WORKER_INTERVAL_MS);
  pollingTimer.unref?.();
}

async function getPollingSettings(userId) {
  await ensureUserSettings(userId);
  const aiActive = await isAiActiveForUser(userId);
  if (!aiActive) {
    await dbPool.query("update user_settings set polling_enabled = false where user_id = $1 and polling_enabled = true", [userId]);
  }
  const result = await dbPool.query(
    `
      select polling_enabled as enabled,
             polling_interval_minutes as "intervalMinutes",
             polling_lookback_value as "lookbackValue",
             polling_lookback_unit as "lookbackUnit",
             polling_last_run_at as "lastRunAt"
      from user_settings
      where user_id = $1
    `,
    [userId],
  );
  return { ...result.rows[0], enabled: Boolean(result.rows[0]?.enabled && aiActive), aiActive };
}

async function savePollingSettings(userId, settings) {
  const result = await dbPool.query(
    `
      insert into user_settings (
        user_id, confidence_threshold, polling_enabled, polling_interval_minutes,
        polling_lookback_value, polling_lookback_unit
      )
      values ($1, 0.9, $2, $3, $4, $5)
      on conflict (user_id) do update
      set polling_enabled = excluded.polling_enabled,
          polling_interval_minutes = excluded.polling_interval_minutes,
          polling_lookback_value = excluded.polling_lookback_value,
          polling_lookback_unit = excluded.polling_lookback_unit,
          updated_at = now()
      returning polling_enabled as enabled,
                polling_interval_minutes as "intervalMinutes",
                polling_lookback_value as "lookbackValue",
                polling_lookback_unit as "lookbackUnit",
                polling_last_run_at as "lastRunAt"
    `,
    [userId, settings.enabled, settings.intervalMinutes, settings.lookbackValue, settings.lookbackUnit],
  );
  return { ...result.rows[0], enabled: Boolean(result.rows[0]?.enabled), aiActive: true };
}

async function ensureUserSettings(userId) {
  await dbPool.query(
    `insert into user_settings (user_id, confidence_threshold) values ($1, 0.9) on conflict (user_id) do nothing`,
    [userId],
  );
}

async function pollDueUsers() {
  const due = await dbPool.query(`
    select user_id as "userId",
           polling_lookback_value as "lookbackValue",
           polling_lookback_unit as "lookbackUnit"
    from user_settings
    where polling_enabled = true
      and (
        polling_last_run_at is null
        or polling_last_run_at <= now() - make_interval(mins => polling_interval_minutes)
      )
  `);

  for (const settings of due.rows) {
    if (activePollingUsers.has(settings.userId)) {
      continue;
    }
    activePollingUsers.add(settings.userId);
    try {
      await dbPool.query("update user_settings set polling_last_run_at = now() where user_id = $1", [settings.userId]);
      await pollUser(settings);
    } finally {
      activePollingUsers.delete(settings.userId);
    }
  }
}

async function pollUser(settings) {
  if (!await isAiActiveForUser(settings.userId)) {
    await dbPool.query("update user_settings set polling_enabled = false where user_id = $1", [settings.userId]);
    return;
  }

  const lookbackHours = settings.lookbackUnit === "days" ? settings.lookbackValue * 24 : settings.lookbackValue;
  const candidates = await searchPollingCandidates(settings.userId, lookbackHours);
  const seen = new Set();
  for (const candidate of candidates) {
    const key = `${candidate.account.id}:${candidate.email.emailId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    try {
      await generateAiLabel(settings.userId, {
        emailId: candidate.email.emailId,
        accountEmail: candidate.account.email,
      });
    } catch (error) {
      console.warn(`Polling could not process ${candidate.account.email}/${candidate.email.emailId}:`, error.message);
    }
  }
}

function parsePollingSettings(body) {
  const intervalMinutes = Number(body?.intervalMinutes);
  const lookbackValue = Number(body?.lookbackValue);
  const lookbackUnit = body?.lookbackUnit === "days" ? "days" : body?.lookbackUnit === "hours" ? "hours" : "";
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 10 || intervalMinutes > 720) {
    return { ok: false, error: "Polling interval must be a whole number from 10 to 720 minutes." };
  }
  if (!Number.isInteger(lookbackValue) || lookbackValue < 1) {
    return { ok: false, error: "Search lookback must be a whole number of at least 1." };
  }
  if (!lookbackUnit) {
    return { ok: false, error: "Search lookback unit must be hours or days." };
  }
  const lookbackHours = lookbackUnit === "days" ? lookbackValue * 24 : lookbackValue;
  if (lookbackHours > 168) {
    return { ok: false, error: "Search lookback cannot exceed 7 days or 168 hours." };
  }
  return {
    ok: true,
    settings: { enabled: Boolean(body?.enabled), intervalMinutes, lookbackValue, lookbackUnit },
  };
}

function handlePollingError(res, error) {
  console.error("Polling settings failed:", error);
  res.status(error.status || 500).json({ error: error.message || "Polling settings failed" });
}
