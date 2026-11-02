import crypto from "node:crypto";
import { dbPool } from "./db.js";
import { mapEmailIndexRow } from "./email-index.js";
import { resolveRequestUser } from "./session.js";

export const ATTENTION_POLICY_VERSION = 1;
export const DEFAULT_ATTENTION_SETTINGS = Object.freeze({
  automaticPrioritization: true,
  behavioralPersonalization: true,
  dashboardEnabled: true,
  maxPriorityEmails: 5,
  quickCleanupSuggestions: true,
});

const SIGNAL_PATTERNS = Object.freeze({
  action: /\b(action|respond|reply|review|requires? attention|needs? attention)\b/i,
  security: /\b(security|breach|compromis|fraud|password|suspicious|login)\b/i,
  reference: /\b(reference|receipt|record|documentation|informational)\b/i,
  promotion: /\b(promotion|promotional|marketing|newsletter|sale|deal|offer|advertis)/i,
  deadline: /\b(deadline|due (?:today|tomorrow|soon|by)|expires?|time[- ]sensitive|register by)\b/i,
});

export async function ensureAttentionDashboardTables() {
  if (!dbPool) return;

  await dbPool.query(`
    create table if not exists email_attention_preferences (
      id uuid primary key,
      user_id text not null references "user"(id) on delete cascade,
      email_index_id uuid not null references email_index(id) on delete cascade,
      followed boolean not null default false,
      placement_override text,
      dismissed_category text,
      dismissed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (user_id, email_index_id),
      check (placement_override is null or placement_override in ('attention', 'interest', 'cleanup')),
      check (dismissed_category is null or dismissed_category in ('attention', 'interest', 'cleanup'))
    )
  `);
  await dbPool.query(`
    create table if not exists email_engagement_events (
      id uuid primary key,
      user_id text not null references "user"(id) on delete cascade,
      email_index_id uuid not null references email_index(id) on delete cascade,
      event_type text not null,
      session_key text not null,
      occurred_at timestamptz not null default now(),
      unique (user_id, email_index_id, event_type, session_key)
    )
  `);
  await dbPool.query("create index if not exists email_engagement_user_email_idx on email_engagement_events (user_id, email_index_id, occurred_at desc)");
  await dbPool.query("alter table user_settings add column if not exists attention_dashboard_enabled boolean not null default true");
  await dbPool.query("alter table user_settings add column if not exists automatic_prioritization boolean not null default true");
  await dbPool.query("alter table user_settings add column if not exists behavioral_personalization boolean not null default true");
  await dbPool.query("alter table user_settings add column if not exists maximum_priority_emails integer not null default 5");
  await dbPool.query("alter table user_settings add column if not exists quick_cleanup_suggestions boolean not null default true");
}

export function registerAttentionDashboardRoutes(app) {
  app.get("/api/settings/attention-dashboard", requireSession, async (req, res) => {
    try {
      res.json(await getAttentionSettings(req.user.id));
    } catch (error) {
      handleError(res, error);
    }
  });

  app.put("/api/settings/attention-dashboard", requireSession, async (req, res) => {
    try {
      const input = parseAttentionSettings(req.body);
      if (!input.ok) return res.status(400).json({ error: input.error });
      res.json(await updateAttentionSettings(req.user.id, input.value));
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/settings/attention-dashboard/preferences", requireSession, async (req, res) => {
    try {
      const result = await dbPool.query(`
        select preference.followed, preference.placement_override as "placementOverride",
          preference.dismissed_category as "dismissedCategory", indexed.email_id as "emailId",
          indexed.subject, indexed.from_name as "sender", indexed.account_email as "accountEmail"
        from email_attention_preferences preference
        join email_index indexed on indexed.id = preference.email_index_id
        where preference.user_id = $1
        order by preference.updated_at desc
        limit 200
      `, [req.user.id]);
      res.json({ preferences: result.rows, total: result.rows.length });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/settings/attention-dashboard/preferences", requireSession, async (req, res) => {
    try {
      const [preferences, events] = await Promise.all([
        dbPool.query("delete from email_attention_preferences where user_id = $1", [req.user.id]),
        dbPool.query("delete from email_engagement_events where user_id = $1", [req.user.id]),
      ]);
      res.json({ resetPreferences: preferences.rowCount, resetEngagementEvents: events.rowCount });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/inbox/attention-dashboard", requireSession, async (req, res) => {
    try {
      const accountIds = parseAccountIds(req.query.accountIds);
      res.json(await getAttentionDashboard(req.user.id, {
        accountIds,
        attentionLimit: parsePageSize(req.query.attentionLimit, 5),
        attentionOffset: parseOffset(req.query.attentionOffset),
        interestLimit: parsePageSize(req.query.interestLimit, 5),
        interestOffset: parseOffset(req.query.interestOffset),
      }));
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/inbox/attention-dashboard/selection", requireSession, async (req, res) => {
    try {
      const category = parseSelectableCategory(req.query.category);
      if (!category) return res.status(400).json({ error: "Needs Attention or Of Interest category is required." });
      const dashboard = await getAttentionDashboard(req.user.id, {
        accountIds: parseAccountIds(req.query.accountIds),
        includeAllPriorityMessages: true,
      });
      res.json({ category, messages: dashboard.categories[category], snapshotAt: new Date().toISOString(), total: dashboard.counts[category] });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/inbox/attention-preference", requireSession, async (req, res) => {
    try {
      const input = parsePreferenceInput(req.body);
      if (!input.ok) return res.status(400).json({ error: input.error });
      const preference = await updateAttentionPreference(req.user.id, input.value);
      if (!preference) return res.status(404).json({ error: "Email was not found in the indexed inbox." });
      res.json({ preference });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/inbox/engagement", requireSession, async (req, res) => {
    try {
      const input = parseEngagementInput(req.body);
      if (!input.ok) return res.status(400).json({ error: input.error });
      const recorded = await recordEngagementEvent(req.user.id, input.value);
      res.json({ recorded });
    } catch (error) {
      handleError(res, error);
    }
  });
}

export function evaluateAttentionPlacement(message, preference = {}, settings = DEFAULT_ATTENTION_SETTINGS, now = new Date()) {
  const signals = message.signals ?? {};
  const activeCommitment = Boolean(message.commitment && !message.commitment.isCompleted && !message.commitment.completedAt);
  const distinctOpens = settings.behavioralPersonalization ? Math.max(0, Number(message.distinctOpens) || 0) : 0;
  const ageDays = Math.max(0, (now.getTime() - new Date(message.date).getTime()) / 86_400_000);
  const recency = ageDays <= 7 ? 10 : ageDays <= 30 ? 5 : 0;
  const engagement = distinctOpens <= 0 ? 0 : distinctOpens === 1 ? 5 : distinctOpens === 2 ? 15 : 30;
  let attentionScore = recency + (signals.action ? 40 : 0) + (signals.security ? 35 : 0) + (signals.deadline ? 35 : 0) + (signals.reference ? 15 : 0) - (signals.promotion ? 20 : 0);
  let interestScore = engagement + (signals.reference ? 15 : 0) + (recency / 2);
  attentionScore = clampScore(attentionScore);
  interestScore = clampScore(interestScore);

  const protectedFromCleanup = activeCommitment || preference.followed || preference.placementOverride === "attention" || signals.action || signals.security || signals.deadline;
  let category = "all";
  let reasonCode = "all_mail_only";
  let explanation = "Available in All Mail.";

  if (activeCommitment) {
    category = "attention";
    reasonCode = "active_commitment";
    explanation = formatCommitmentExplanation(message.commitment);
  } else if (preference.placementOverride === "attention") {
    category = "attention";
    reasonCode = "explicit_attention";
    explanation = "You marked this email as needing attention.";
  } else if (settings.automaticPrioritization && (signals.action || signals.security || signals.deadline)) {
    category = "attention";
    reasonCode = signals.deadline ? "potential_deadline" : signals.security ? "security_notice" : "possible_action";
    explanation = signals.deadline ? "Potential deadline — review suggested." : signals.security ? "Security notice that may require review." : "This message may require action or review.";
  } else if (preference.followed || preference.placementOverride === "interest") {
    category = "interest";
    reasonCode = preference.followed ? "followed" : "explicit_interest";
    explanation = preference.followed ? "You're following this email." : "You moved this email to Of Interest.";
  } else if (settings.automaticPrioritization && distinctOpens >= 2) {
    category = "interest";
    reasonCode = "repeated_engagement";
    explanation = `Opened in ${distinctOpens} distinct sessions.`;
  } else if (settings.quickCleanupSuggestions && !protectedFromCleanup && (preference.placementOverride === "cleanup" || signals.promotion)) {
    category = "cleanup";
    reasonCode = preference.placementOverride === "cleanup" ? "explicit_low_priority" : "promotional_or_routine";
    explanation = preference.placementOverride === "cleanup" ? "You marked this email as low priority." : "Likely promotional or routine email.";
  }

  if (preference.dismissedCategory === category && category !== "all" && !activeCommitment) {
    category = "all";
    reasonCode = "dismissed";
    explanation = "Recommendation dismissed; the email remains in All Mail.";
  }

  return { attentionScore, category, explanation, interestScore, policyVersion: ATTENTION_POLICY_VERSION, reasonCode };
}

export function deriveAttentionSignals(message, labelCatalog = []) {
  const descriptionByName = new Map(labelCatalog.map((label) => [String(label.name).toLowerCase(), String(label.description || "")]));
  const evidence = (message.labels ?? []).map((label) => `${label} ${descriptionByName.get(String(label).toLowerCase()) || ""}`).join(" ");
  const content = `${message.subject || ""} ${message.snippet || ""}`;
  return {
    action: SIGNAL_PATTERNS.action.test(evidence),
    deadline: SIGNAL_PATTERNS.deadline.test(content) || SIGNAL_PATTERNS.deadline.test(evidence),
    promotion: SIGNAL_PATTERNS.promotion.test(evidence),
    reference: SIGNAL_PATTERNS.reference.test(evidence),
    security: SIGNAL_PATTERNS.security.test(evidence),
  };
}

async function getAttentionDashboard(userId, {
  accountIds = [],
  attentionLimit = 5,
  attentionOffset = 0,
  includeAllPriorityMessages = false,
  interestLimit = 5,
  interestOffset = 0,
} = {}) {
  const settings = await getAttentionSettings(userId);
  const values = [userId];
  const accountFilter = accountIds.length ? `and indexed.email_account_id = any($2::uuid[])` : "";
  if (accountIds.length) values.push(accountIds);
  const [emailResult, labelResult] = await Promise.all([
    dbPool.query(`
      select indexed.*,
        preference.followed,
        preference.placement_override,
        preference.dismissed_category,
        coalesce(engagement.distinct_opens, 0)::int as distinct_opens
      from email_index indexed
      left join email_attention_preferences preference
        on preference.user_id = indexed.user_id and preference.email_index_id = indexed.id
      left join (
        select email_index_id, count(*)::int as distinct_opens
        from email_engagement_events
        where user_id = $1 and event_type = 'open'
        group by email_index_id
      ) engagement on engagement.email_index_id = indexed.id
      where indexed.user_id = $1
        ${accountFilter}
        and indexed.direction = 'inbox'
        and indexed.trashed_at is null
        and (indexed.archived = false or preference.followed = true)
      order by indexed.received_at desc
    `, values),
    dbPool.query("select name, description from labels where user_id = $1", [userId]),
  ]);

  const categories = { attention: [], interest: [], cleanup: [], all: [] };
  for (const row of emailResult.rows) {
    const message = mapEmailIndexRow(row);
    message.distinctOpens = Number(row.distinct_opens || 0);
    message.signals = deriveAttentionSignals(message, labelResult.rows);
    const placement = evaluateAttentionPlacement(message, {
      dismissedCategory: row.dismissed_category || null,
      followed: Boolean(row.followed),
      placementOverride: row.placement_override || null,
    }, settings);
    const decorated = { ...message, attention: placement, followed: Boolean(row.followed) };
    categories[placement.category].push(decorated);
  }

  categories.attention.sort(compareAttentionMessages);
  categories.interest.sort(compareInterestMessages);
  const cleanupGroups = groupCleanupMessages(categories.cleanup);
  const attentionPage = includeAllPriorityMessages ? categories.attention : paginateAttentionCategory(categories.attention, attentionOffset, attentionLimit);
  const interestPage = includeAllPriorityMessages ? categories.interest : paginateAttentionCategory(categories.interest, interestOffset, interestLimit);
  return {
    counts: {
      attention: categories.attention.length,
      cleanup: categories.cleanup.length,
      interest: categories.interest.length,
    },
    categories: {
      attention: attentionPage,
      cleanup: categories.cleanup,
      interest: interestPage,
    },
    cleanupGroups,
    pagination: {
      attention: buildPagination(categories.attention.length, attentionOffset, attentionPage.length),
      interest: buildPagination(categories.interest.length, interestOffset, interestPage.length),
    },
    settings,
  };
}

export function paginateAttentionCategory(messages, offset, limit) {
  return messages.slice(Math.max(0, offset), Math.max(0, offset) + Math.max(1, limit));
}

function buildPagination(total, offset, returned) {
  const nextOffset = offset + returned;
  return { hasMore: nextOffset < total, nextOffset: nextOffset < total ? nextOffset : null, total };
}

async function getAttentionSettings(userId) {
  const result = await dbPool.query(`
    select attention_dashboard_enabled, automatic_prioritization, behavioral_personalization,
      maximum_priority_emails, quick_cleanup_suggestions
    from user_settings where user_id = $1
  `, [userId]);
  const row = result.rows[0];
  if (!row) return { ...DEFAULT_ATTENTION_SETTINGS };
  return {
    automaticPrioritization: row.automatic_prioritization !== false,
    behavioralPersonalization: row.behavioral_personalization !== false,
    dashboardEnabled: row.attention_dashboard_enabled !== false,
    maxPriorityEmails: [3, 5, 10].includes(Number(row.maximum_priority_emails)) ? Number(row.maximum_priority_emails) : 5,
    quickCleanupSuggestions: row.quick_cleanup_suggestions !== false,
  };
}

async function updateAttentionSettings(userId, settings) {
  const result = await dbPool.query(`
    insert into user_settings (
      user_id, attention_dashboard_enabled, automatic_prioritization,
      behavioral_personalization, maximum_priority_emails, quick_cleanup_suggestions
    ) values ($1, $2, $3, $4, $5, $6)
    on conflict (user_id) do update set
      attention_dashboard_enabled = excluded.attention_dashboard_enabled,
      automatic_prioritization = excluded.automatic_prioritization,
      behavioral_personalization = excluded.behavioral_personalization,
      maximum_priority_emails = excluded.maximum_priority_emails,
      quick_cleanup_suggestions = excluded.quick_cleanup_suggestions,
      updated_at = now()
    returning attention_dashboard_enabled, automatic_prioritization, behavioral_personalization,
      maximum_priority_emails, quick_cleanup_suggestions
  `, [userId, settings.dashboardEnabled, settings.automaticPrioritization, settings.behavioralPersonalization, settings.maxPriorityEmails, settings.quickCleanupSuggestions]);
  const row = result.rows[0];
  return {
    automaticPrioritization: row.automatic_prioritization,
    behavioralPersonalization: row.behavioral_personalization,
    dashboardEnabled: row.attention_dashboard_enabled,
    maxPriorityEmails: Number(row.maximum_priority_emails),
    quickCleanupSuggestions: row.quick_cleanup_suggestions,
  };
}

async function updateAttentionPreference(userId, input) {
  const indexed = await findIndexedEmail(userId, input);
  if (!indexed) return null;
  const updates = preferenceUpdatesForAction(input.action, input.category);
  const result = await dbPool.query(`
    insert into email_attention_preferences (
      id, user_id, email_index_id, followed, placement_override, dismissed_category, dismissed_at
    ) values ($1, $2, $3, coalesce($4, false), $5, $6, $7)
    on conflict (user_id, email_index_id) do update set
      followed = coalesce($4, email_attention_preferences.followed),
      placement_override = case when $8::boolean then $5 else email_attention_preferences.placement_override end,
      dismissed_category = case when $9::boolean then $6 else email_attention_preferences.dismissed_category end,
      dismissed_at = case when $9::boolean then $7 else email_attention_preferences.dismissed_at end,
      updated_at = now()
    returning followed, placement_override as "placementOverride", dismissed_category as "dismissedCategory"
  `, [crypto.randomUUID(), userId, indexed.id, updates.followed, updates.placementOverride, updates.dismissedCategory, updates.dismissedAt, updates.setPlacement, updates.setDismissal]);
  return result.rows[0];
}

async function recordEngagementEvent(userId, input) {
  const indexed = await findIndexedEmail(userId, input);
  if (!indexed) return false;
  const sessionKey = buildEngagementSessionKey(input.eventType, input.sessionId);
  const result = await dbPool.query(`
    insert into email_engagement_events (id, user_id, email_index_id, event_type, session_key)
    values ($1, $2, $3, $4, $5)
    on conflict (user_id, email_index_id, event_type, session_key) do nothing
    returning id
  `, [crypto.randomUUID(), userId, indexed.id, input.eventType, sessionKey]);
  return result.rowCount > 0;
}

export function buildEngagementSessionKey(eventType, sessionId, now = new Date()) {
  return `${sessionId || now.toISOString().slice(0, 10)}:${eventType}`.slice(0, 180);
}

async function findIndexedEmail(userId, input) {
  const result = await dbPool.query(`
    select id from email_index
    where user_id = $1 and email_account_id = $2 and email_id = $3 and mailbox = $4
    limit 1
  `, [userId, input.accountId, input.emailId, input.mailbox || ""]);
  return result.rows[0] || null;
}

function preferenceUpdatesForAction(action, category) {
  if (action === "follow") return { followed: true, placementOverride: null, dismissedCategory: null, dismissedAt: null, setPlacement: false, setDismissal: false };
  if (action === "unfollow") return { followed: false, placementOverride: null, dismissedCategory: null, dismissedAt: null, setPlacement: false, setDismissal: false };
  if (action === "mark_attention") return { followed: null, placementOverride: "attention", dismissedCategory: null, dismissedAt: null, setPlacement: true, setDismissal: true };
  if (action === "mark_interest") return { followed: null, placementOverride: "interest", dismissedCategory: null, dismissedAt: null, setPlacement: true, setDismissal: true };
  if (action === "mark_low_priority") return { followed: null, placementOverride: "cleanup", dismissedCategory: null, dismissedAt: null, setPlacement: true, setDismissal: true };
  if (action === "clear_override") return { followed: null, placementOverride: null, dismissedCategory: null, dismissedAt: null, setPlacement: true, setDismissal: true };
  return { followed: null, placementOverride: null, dismissedCategory: category, dismissedAt: new Date(), setPlacement: false, setDismissal: true };
}

function groupCleanupMessages(messages) {
  const groups = new Map();
  for (const message of messages) {
    const key = (message.from || message.sender || "Unknown sender").toLowerCase();
    const group = groups.get(key) || { id: key, name: message.sender || message.from || "Unknown sender", messages: [], mostRecentAt: message.date };
    group.messages.push(message);
    if (new Date(message.date) > new Date(group.mostRecentAt)) group.mostRecentAt = message.date;
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({ ...group, count: group.messages.length })).sort((a, b) => b.count - a.count || new Date(b.mostRecentAt) - new Date(a.mostRecentAt));
}

function compareAttentionMessages(left, right) {
  const leftCommitment = left.commitment && !left.commitment.isCompleted ? 1 : 0;
  const rightCommitment = right.commitment && !right.commitment.isCompleted ? 1 : 0;
  return rightCommitment - leftCommitment || right.attention.attentionScore - left.attention.attentionScore || new Date(right.date) - new Date(left.date) || attentionMessageKey(left).localeCompare(attentionMessageKey(right));
}

function compareInterestMessages(left, right) {
  return Number(right.followed) - Number(left.followed) || right.attention.interestScore - left.attention.interestScore || new Date(right.date) - new Date(left.date) || attentionMessageKey(left).localeCompare(attentionMessageKey(right));
}

function attentionMessageKey(message) {
  return `${message.accountId}:${message.mailbox || ""}:${message.id}`;
}

function formatCommitmentExplanation(commitment) {
  if (!commitment?.dueAt) return "Active Commitment.";
  const due = new Date(commitment.dueAt);
  const days = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "Commitment due now.";
  if (days === 1) return "Commitment due tomorrow.";
  return `Commitment due in ${days} days.`;
}

function parsePreferenceInput(body) {
  const identity = parseEmailIdentity(body);
  const action = String(body?.action || "");
  if (!identity.ok) return identity;
  if (!["follow", "unfollow", "mark_attention", "mark_interest", "mark_low_priority", "dismiss", "clear_override"].includes(action)) return { ok: false, error: "Invalid attention preference action." };
  const category = ["attention", "interest", "cleanup"].includes(body?.category) ? body.category : null;
  if (action === "dismiss" && !category) return { ok: false, error: "A dashboard category is required to dismiss a recommendation." };
  return { ok: true, value: { ...identity.value, action, category } };
}

function parseEngagementInput(body) {
  const identity = parseEmailIdentity(body);
  if (!identity.ok) return identity;
  const eventType = String(body?.eventType || "");
  if (!["open", "search_open", "archive", "delete", "reply"].includes(eventType)) return { ok: false, error: "Invalid engagement event." };
  return { ok: true, value: { ...identity.value, eventType, sessionId: String(body?.sessionId || "").trim() } };
}

function parseEmailIdentity(body) {
  const accountId = String(body?.accountId || "").trim();
  const emailId = String(body?.emailId || "").trim();
  const mailbox = String(body?.mailbox || "").trim();
  if (!accountId || !emailId) return { ok: false, error: "accountId and emailId are required." };
  return { ok: true, value: { accountId, emailId, mailbox } };
}

function parseAttentionSettings(body) {
  const maxPriorityEmails = Number(body?.maxPriorityEmails);
  if (![3, 5, 10].includes(maxPriorityEmails)) return { ok: false, error: "Maximum priority emails must be 3, 5, or 10." };
  return {
    ok: true,
    value: {
      automaticPrioritization: body?.automaticPrioritization !== false,
      behavioralPersonalization: body?.behavioralPersonalization !== false,
      dashboardEnabled: body?.dashboardEnabled !== false,
      maxPriorityEmails,
      quickCleanupSuggestions: body?.quickCleanupSuggestions !== false,
    },
  };
}

function parseAccountIds(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean).slice(0, 50);
}

function parseOffset(value) {
  return Math.max(0, Number.parseInt(String(value || "0"), 10) || 0);
}

function parsePageSize(value, fallback) {
  return Math.min(50, Math.max(1, Number.parseInt(String(value || fallback), 10) || fallback));
}

function parseSelectableCategory(value) {
  return value === "attention" || value === "interest" ? value : null;
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function requireSession(req, res, next) {
  const user = await resolveRequestUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  req.user = user;
  next();
}

function handleError(res, error) {
  console.error(error);
  res.status(500).json({ error: error instanceof Error ? error.message : "Attention dashboard request failed." });
}
