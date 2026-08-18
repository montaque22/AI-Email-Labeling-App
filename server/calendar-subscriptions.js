import crypto from "node:crypto";
import ical from "node-ical";
import { dbPool } from "./db.js";
import { requireSession } from "./session.js";

const DEFAULT_EVENT_COLOR = "#2563eb";
const CALENDAR_FETCH_TIMEOUT_MS = 15000;
const RECURRENCE_PAST_MONTHS = 12;
const RECURRENCE_FUTURE_MONTHS = 24;

export async function ensureCalendarSubscriptionTables() {
  if (!dbPool) {
    return;
  }

  await dbPool.query(`
    create table if not exists calendar_subscriptions (
      id uuid primary key,
      user_id text not null references "user"(id) on delete cascade,
      name text not null,
      url text not null,
      color text not null default '${DEFAULT_EVENT_COLOR}',
      enabled boolean not null default true,
      last_fetched_at timestamptz,
      last_error text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (user_id, url)
    )
  `);
  await dbPool.query(`
    create table if not exists calendar_subscription_events (
      id uuid primary key,
      user_id text not null references "user"(id) on delete cascade,
      subscription_id uuid not null references calendar_subscriptions(id) on delete cascade,
      external_id text not null,
      title text not null,
      description text not null default '',
      location text not null default '',
      starts_at timestamptz not null,
      ends_at timestamptz,
      all_day boolean not null default false,
      url text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (subscription_id, external_id)
    )
  `);
  await dbPool.query("create index if not exists calendar_subscriptions_user_idx on calendar_subscriptions(user_id)");
  await dbPool.query("create index if not exists calendar_subscription_events_user_starts_idx on calendar_subscription_events(user_id, starts_at)");
  await dbPool.query("create index if not exists calendar_subscription_events_subscription_idx on calendar_subscription_events(subscription_id)");
}

export function registerCalendarSubscriptionRoutes(app) {
  app.get("/api/calendar/subscriptions", requireSession, async (req, res) => {
    try {
      const subscriptions = await listCalendarSubscriptions(req.user.id);
      res.json({ subscriptions });
    } catch (error) {
      handleCalendarError(res, error);
    }
  });

  app.post("/api/calendar/subscriptions", requireSession, async (req, res) => {
    const input = parseSubscriptionInput(req.body);
    if (!input.ok) {
      res.status(400).json({ error: input.error });
      return;
    }

    try {
      const parsedEvents = await validateCalendarFeed(input.subscription.url);
      const subscription = await upsertCalendarSubscription(req.user.id, input.subscription);
      const syncResult = await saveCalendarSyncSuccess(req.user.id, subscription.id, parsedEvents);
      res.status(201).json({ subscription: syncResult.subscription, eventCount: syncResult.eventCount });
    } catch (error) {
      handleCalendarError(res, error);
    }
  });

  app.put("/api/calendar/subscriptions/:id", requireSession, async (req, res) => {
    const input = parseSubscriptionInput(req.body);
    if (!input.ok) {
      res.status(400).json({ error: input.error });
      return;
    }

    try {
      const existingSubscription = await getCalendarSubscription(req.user.id, req.params.id);
      if (!existingSubscription) {
        res.status(404).json({ error: "Calendar subscription not found" });
        return;
      }

      const parsedEvents = await validateCalendarFeed(input.subscription.url);
      const subscription = await updateCalendarSubscription(req.user.id, req.params.id, input.subscription);
      const syncResult = await saveCalendarSyncSuccess(req.user.id, subscription.id, parsedEvents);
      res.json({ subscription: syncResult.subscription, eventCount: syncResult.eventCount });
    } catch (error) {
      handleCalendarError(res, error);
    }
  });

  app.delete("/api/calendar/subscriptions/:id", requireSession, async (req, res) => {
    try {
      await dbPool.query("delete from calendar_subscriptions where id = $1 and user_id = $2", [req.params.id, req.user.id]);
      res.json({ ok: true });
    } catch (error) {
      handleCalendarError(res, error);
    }
  });

  app.post("/api/calendar/subscriptions/:id/sync", requireSession, async (req, res) => {
    try {
      const syncResult = await syncCalendarSubscription(req.user.id, req.params.id);
      res.json({ subscription: syncResult.subscription, eventCount: syncResult.eventCount });
    } catch (error) {
      handleCalendarError(res, error);
    }
  });

  app.get("/api/calendar/events", requireSession, async (req, res) => {
    const range = parseEventRange(req.query);
    if (!range.ok) {
      res.status(400).json({ error: range.error });
      return;
    }

    try {
      const events = await listCalendarEvents(req.user.id, range);
      res.json({ events });
    } catch (error) {
      handleCalendarError(res, error);
    }
  });
}

async function listCalendarSubscriptions(userId) {
  const result = await dbPool.query(
    `
      select
        s.*,
        count(e.id)::int as event_count
      from calendar_subscriptions s
      left join calendar_subscription_events e on e.subscription_id = s.id
      where s.user_id = $1
      group by s.id
      order by s.created_at asc
    `,
    [userId],
  );
  return result.rows.map(mapSubscriptionRow);
}

async function getCalendarSubscription(userId, id) {
  const result = await dbPool.query("select * from calendar_subscriptions where id = $1 and user_id = $2", [id, userId]);
  return result.rows[0] ? mapSubscriptionRow(result.rows[0]) : null;
}

async function upsertCalendarSubscription(userId, subscription) {
  const result = await dbPool.query(
    `
      insert into calendar_subscriptions (id, user_id, name, url, color, enabled)
      values ($1, $2, $3, $4, $5, true)
      on conflict (user_id, url)
      do update set
        name = excluded.name,
        color = excluded.color,
        enabled = true,
        updated_at = now()
      returning *
    `,
    [crypto.randomUUID(), userId, subscription.name, subscription.url, subscription.color],
  );
  return mapSubscriptionRow(result.rows[0]);
}

async function updateCalendarSubscription(userId, id, subscription) {
  const result = await dbPool.query(
    `
      update calendar_subscriptions
      set name = $3,
          url = $4,
          color = $5,
          updated_at = now()
      where id = $1 and user_id = $2
      returning *
    `,
    [id, userId, subscription.name, subscription.url, subscription.color],
  );
  return result.rows[0] ? mapSubscriptionRow(result.rows[0]) : null;
}

async function syncCalendarSubscription(userId, subscriptionId) {
  const subscriptionResult = await dbPool.query("select * from calendar_subscriptions where id = $1 and user_id = $2", [subscriptionId, userId]);
  const subscription = subscriptionResult.rows[0];
  if (!subscription) {
    const error = new Error("Calendar subscription not found");
    error.status = 404;
    throw error;
  }

  try {
    const parsedEvents = await validateCalendarFeed(subscription.url);
    return await saveCalendarSyncSuccess(userId, subscription.id, parsedEvents);
  } catch (error) {
    await dbPool.query(
      "update calendar_subscriptions set last_error = $3, updated_at = now() where id = $1 and user_id = $2",
      [subscription.id, userId, error instanceof Error ? error.message : "Calendar sync failed"],
    );
    throw error;
  }
}

async function validateCalendarFeed(url) {
  const ics = await fetchCalendarFeed(url);
  return parseCalendarFeedEvents(ics);
}

async function saveCalendarSyncSuccess(userId, subscriptionId, parsedEvents) {
  await replaceSubscriptionEvents(userId, subscriptionId, parsedEvents);
  const updatedResult = await dbPool.query(
    "update calendar_subscriptions set last_fetched_at = now(), last_error = null, updated_at = now() where id = $1 and user_id = $2 returning *",
    [subscriptionId, userId],
  );
  return {
    subscription: { ...mapSubscriptionRow(updatedResult.rows[0]), eventCount: parsedEvents.length },
    eventCount: parsedEvents.length,
  };
}

async function fetchCalendarFeed(rawUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CALENDAR_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(rawUrl, {
      headers: {
        Accept: "text/calendar, application/calendar+json, text/plain, */*",
        "User-Agent": "Emailable Calendar Subscription",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Calendar feed returned ${response.status}`);
    }
    const text = await response.text();
    if (!looksLikeIcalFeed(text)) {
      throw new Error("Calendar subscription must be an iCalendar feed URL. For Google Calendar, use the public or secret address in iCal format from calendar settings, not the normal calendar.google.com web page URL.");
    }
    return text;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Calendar feed request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseCalendarFeedEvents(ics) {
  const parsed = ical.sync.parseICS(ics);
  const windowStart = addMonths(new Date(), -RECURRENCE_PAST_MONTHS);
  const windowEnd = addMonths(new Date(), RECURRENCE_FUTURE_MONTHS);
  const events = [];

  for (const [key, event] of Object.entries(parsed)) {
    if (event?.type !== "VEVENT" || !event.start) {
      continue;
    }

    if (event.rrule?.between) {
      const durationMs = getEventDurationMs(event);
      const dates = event.rrule.between(windowStart, windowEnd, true);
      for (const date of dates.slice(0, 750)) {
        events.push(normalizeIcalEvent(event, `${event.uid || key}:${date.toISOString()}`, date, new Date(date.getTime() + durationMs)));
      }
      continue;
    }

    events.push(normalizeIcalEvent(event, event.uid || key, event.start, event.end));
  }

  return events.filter((event) => event.startsAt instanceof Date && !Number.isNaN(event.startsAt.getTime()));
}

function normalizeIcalEvent(event, externalId, startsAt, endsAt) {
  return {
    externalId: String(externalId || crypto.randomUUID()).slice(0, 500),
    title: cleanText(event.summary || "Untitled event").slice(0, 300),
    description: cleanText(event.description || "").slice(0, 5000),
    location: cleanText(event.location || "").slice(0, 500),
    startsAt: new Date(startsAt),
    endsAt: endsAt ? new Date(endsAt) : null,
    allDay: event.datetype === "date",
    url: cleanText(event.url || "").slice(0, 1000),
  };
}

async function replaceSubscriptionEvents(userId, subscriptionId, events) {
  await dbPool.query("delete from calendar_subscription_events where user_id = $1 and subscription_id = $2", [userId, subscriptionId]);
  for (const event of events) {
    await dbPool.query(
      `
        insert into calendar_subscription_events (
          id, user_id, subscription_id, external_id, title, description, location,
          starts_at, ends_at, all_day, url
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        on conflict (subscription_id, external_id)
        do update set
          title = excluded.title,
          description = excluded.description,
          location = excluded.location,
          starts_at = excluded.starts_at,
          ends_at = excluded.ends_at,
          all_day = excluded.all_day,
          url = excluded.url,
          updated_at = now()
      `,
      [
        crypto.randomUUID(),
        userId,
        subscriptionId,
        event.externalId,
        event.title,
        event.description,
        event.location,
        event.startsAt,
        event.endsAt,
        event.allDay,
        event.url,
      ],
    );
  }
}

async function listCalendarEvents(userId, range) {
  const values = [userId, range.start, range.end];
  const subscriptionFilter = range.subscriptionIds.length
    ? "and e.subscription_id = any($4::uuid[])"
    : "and s.enabled = true";
  if (range.subscriptionIds.length) {
    values.push(range.subscriptionIds);
  }

  const result = await dbPool.query(
    `
      select
        e.*,
        s.name as subscription_name,
        s.color as subscription_color
      from calendar_subscription_events e
      join calendar_subscriptions s on s.id = e.subscription_id
      where e.user_id = $1
        and e.starts_at < $3
        and coalesce(e.ends_at, e.starts_at) >= $2
        ${subscriptionFilter}
      order by e.starts_at asc, e.title asc
      limit 1000
    `,
    values,
  );
  return result.rows.map(mapEventRow);
}

function parseSubscriptionInput(body) {
  const urlResult = normalizeSubscriptionUrl(body?.url);
  if (!urlResult.ok) {
    return urlResult;
  }

  const name = String(body?.name || "").trim().slice(0, 120) || deriveNameFromUrl(urlResult.url);
  const color = normalizeColor(body?.color);
  return {
    ok: true,
    subscription: {
      name,
      url: urlResult.url,
      color,
    },
  };
}

function normalizeSubscriptionUrl(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return { ok: false, error: "Calendar subscription URL is required" };
  }

  const normalizedValue = rawValue.replace(/^webcal:\/\//i, "https://");
  try {
    const url = new URL(normalizedValue);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, error: "Calendar subscription URL must use http, https, or webcal" };
    }
    if (isGoogleCalendarWebUrl(url)) {
      return {
        ok: false,
        error:
          "That is a Google Calendar web page URL. Use the calendar's public or secret address in iCal format instead. In Google Calendar, open Settings for the calendar, then copy the iCal URL from Integrate calendar.",
      };
    }
    return { ok: true, url: url.toString() };
  } catch {
    return { ok: false, error: "Calendar subscription URL is invalid" };
  }
}

function isGoogleCalendarWebUrl(url) {
  return /(^|\.)calendar\.google\.com$/i.test(url.hostname) && !url.pathname.includes("/calendar/ical/");
}

function looksLikeIcalFeed(value) {
  return /BEGIN:VCALENDAR/i.test(String(value || ""));
}

function parseEventRange(query) {
  const start = new Date(String(query.start || ""));
  const end = new Date(String(query.end || ""));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { ok: false, error: "A valid start and end range is required" };
  }

  const subscriptionIds = String(query.subscriptionIds || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  return { ok: true, start, end, subscriptionIds };
}

function normalizeColor(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_EVENT_COLOR;
}

function deriveNameFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "") || "Calendar subscription";
  } catch {
    return "Calendar subscription";
  }
}

function cleanText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function getEventDurationMs(event) {
  const start = event.start instanceof Date ? event.start.getTime() : 0;
  const end = event.end instanceof Date ? event.end.getTime() : start;
  return Math.max(end - start, 0);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, date.getDate());
}

function mapSubscriptionRow(row) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    color: row.color,
    enabled: row.enabled,
    eventCount: Number(row.event_count ?? 0),
    lastFetchedAt: row.last_fetched_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEventRow(row) {
  return {
    id: row.id,
    subscriptionId: row.subscription_id,
    subscriptionName: row.subscription_name,
    color: row.subscription_color,
    title: row.title,
    description: row.description,
    location: row.location,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    allDay: row.all_day,
    url: row.url,
  };
}

function handleCalendarError(res, error) {
  console.error("Calendar API failed:", error);
  res.status(error?.status || 500).json({ error: error instanceof Error ? error.message : "Calendar request failed" });
}
