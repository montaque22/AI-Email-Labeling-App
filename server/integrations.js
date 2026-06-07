import crypto from "node:crypto";
import { auth } from "./auth.js";
import { dbPool } from "./db.js";
import { ensureSsoEmailAccount, getValidEmailAccountAccessToken } from "./email-accounts.js";
import { ensureLabelSyncedToAccount } from "./label-sync.js";
import { getConfidenceThreshold } from "./settings.js";

const API_KEY_PREFIX = "n8n";
const EMAIL_RULE_REQUIRED_FIELDS = [
  "emailId",
  "threadId",
  "fromEmail",
  "fromName",
  "subject",
  "snippet",
  "confidence",
  "labelsApplied",
];
const EMAIL_RULE_COLUMNS = {
  emailId: "email_id",
  threadId: "thread_id",
  fromEmail: "from_email",
  fromName: "from_name",
  subject: "subject",
  snippet: "snippet",
  confidence: "confidence",
  labelsApplied: "labels_applied",
  isPending: "is_pending",
  metadata: "metadata",
};
const EMAIL_RULE_QUERY_FIELDS = {
  fromEmail: { column: "from_email", type: "string" },
  fromName: { column: "from_name", type: "string" },
  subject: { column: "subject", type: "string" },
  isPending: { column: "is_pending", type: "boolean" },
};
const EMAIL_RULE_SELECT = `
  id,
  email_id as "emailId",
  thread_id as "threadId",
  from_email as "fromEmail",
  from_name as "fromName",
  subject,
  snippet,
  confidence,
  labels_applied as "labelsApplied",
  is_pending as "isPending",
  metadata,
  created_at as "createdAt",
  updated_at as "updatedAt"
`;

export async function ensureIntegrationTables() {
  if (!dbPool) {
    return;
  }

  await dbPool.query(`
    create table if not exists integration_api_keys (
      id uuid primary key,
      user_id text not null references "user"(id) on delete cascade,
      name text not null,
      key_hash text not null unique,
      key_prefix text not null,
      last_used_at timestamptz,
      created_at timestamptz not null default now()
    )
  `);
  await dbPool.query("create index if not exists integration_api_keys_user_id_idx on integration_api_keys(user_id)");

  await dbPool.query(`
    create table if not exists email_rules (
      id uuid primary key,
      user_id text not null references "user"(id) on delete cascade,
      email_id text not null,
      thread_id text not null,
      from_email text not null,
      from_name text not null,
      subject text not null,
      snippet text not null,
      confidence double precision not null,
      labels_applied text[] not null default '{}',
      is_pending boolean not null,
      metadata jsonb not null default '{}',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (user_id, email_id)
    )
  `);
  await dbPool.query("create index if not exists email_rules_user_id_idx on email_rules(user_id)");
  await dbPool.query("create index if not exists email_rules_from_email_idx on email_rules(user_id, lower(from_email))");
  await dbPool.query("create index if not exists email_rules_from_name_idx on email_rules(user_id, lower(from_name))");
  await dbPool.query("create index if not exists email_rules_subject_idx on email_rules(user_id, lower(subject))");
  await dbPool.query("create index if not exists email_rules_is_pending_idx on email_rules(user_id, is_pending)");
}

export function registerIntegrationRoutes(app) {
  app.get("/api/integration-api-keys", requireSession, async (req, res) => {
    try {
      const result = await dbPool.query(
        `
          select id, name, key_prefix as "keyPrefix", last_used_at as "lastUsedAt", created_at as "createdAt"
          from integration_api_keys
          where user_id = $1
          order by created_at desc
        `,
        [req.user.id],
      );

      res.json({ keys: result.rows });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/integration-api-keys", requireSession, async (req, res) => {
    const name = typeof req.body?.name === "string" && req.body.name.trim() ? req.body.name.trim() : "n8n";
    const token = createApiKey();
    const keyPrefix = token.slice(0, 12);

    try {
      const result = await dbPool.query(
        `
          insert into integration_api_keys (id, user_id, name, key_hash, key_prefix)
          values ($1, $2, $3, $4, $5)
          returning id, name, key_prefix as "keyPrefix", created_at as "createdAt"
        `,
        [crypto.randomUUID(), req.user.id, name.slice(0, 60), hashApiKey(token), keyPrefix],
      );

      res.status(201).json({ key: result.rows[0], token });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/integration-api-keys/:id", requireSession, async (req, res) => {
    try {
      const result = await dbPool.query("delete from integration_api_keys where user_id = $1 and id = $2", [
        req.user.id,
        req.params.id,
      ]);

      res.json({ deleted: result.rowCount });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/email-rules", requireSession, async (req, res) => {
    const pageSize = parseRulePageSize(req.query.pageSize);
    const page = parseRulePage(req.query.page);
    const pendingFilter = parsePendingFilter(req.query.status);
    const conditions = ["user_id = $1"];
    const values = [req.user.id];

    if (pendingFilter !== null) {
      values.push(pendingFilter);
      conditions.push(`is_pending = $${values.length}`);
    }

    try {
      const count = await dbPool.query(
        `select count(*)::int as count from email_rules where ${conditions.join(" and ")}`,
        values,
      );
      values.push(pageSize);
      values.push((page - 1) * pageSize);

      const result = await dbPool.query(
        `
          select ${EMAIL_RULE_SELECT}
          from email_rules
          where ${conditions.join(" and ")}
          order by is_pending desc, updated_at desc
          limit $${values.length - 1}
          offset $${values.length}
        `,
        values,
      );

      res.json({
        total: count.rows[0]?.count ?? 0,
        page,
        pageSize,
        rules: result.rows.map(mapEmailRuleRow),
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/email-rules/export", requireSession, async (req, res) => {
    try {
      const result = await dbPool.query(
        `
          select ${EMAIL_RULE_SELECT}
          from email_rules
          where user_id = $1
          order by created_at desc
        `,
        [req.user.id],
      );
      const csv = emailRulesToCsv(result.rows.map(mapEmailRuleRow));

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="email-rules.csv"');
      res.send(csv);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.put("/api/email-rules/:emailId/review", requireSession, async (req, res) => {
    const labelsApplied = Array.isArray(req.body?.labelsApplied)
      ? req.body.labelsApplied.filter((label) => typeof label === "string").map((label) => label.trim()).filter(Boolean)
      : null;
    const recommendedAction =
      typeof req.body?.recommendedAction === "string" ? req.body.recommendedAction.trim() : "";

    if (!labelsApplied) {
      res.status(400).json({ error: "labelsApplied must be an array of strings" });
      return;
    }

    if (recommendedAction.length > 200) {
      res.status(400).json({ error: "recommendedAction must be 200 characters or less" });
      return;
    }

    try {
      const result = await dbPool.query(
        `
          update email_rules
          set labels_applied = $3,
              is_pending = false,
              confidence = 1,
              metadata = (metadata - 'reason' - 'userQuestion') || jsonb_build_object('recommendedAction', $4::text),
              updated_at = now()
          where user_id = $1 and email_id = $2
          returning ${EMAIL_RULE_SELECT}
        `,
        [req.user.id, req.params.emailId, [...new Set(labelsApplied)], recommendedAction],
      );

      if (!result.rows[0]) {
        res.status(404).json({ error: "Email rule not found" });
        return;
      }

      res.json({ rule: mapEmailRuleRow(result.rows[0]) });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/email-rules", requireSession, async (req, res) => {
    const emailIds = Array.isArray(req.body?.emailIds)
      ? req.body.emailIds.filter((emailId) => typeof emailId === "string" && emailId.trim()).map((emailId) => emailId.trim())
      : [];

    if (emailIds.length === 0) {
      res.status(400).json({ error: "Select at least one email rule to delete" });
      return;
    }

    try {
      const result = await dbPool.query("delete from email_rules where user_id = $1 and email_id = any($2::text[])", [
        req.user.id,
        [...new Set(emailIds)],
      ]);

      res.json({ deleted: result.rowCount });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/email-rules/:emailId", requireSession, async (req, res) => {
    try {
      const result = await dbPool.query("delete from email_rules where user_id = $1 and email_id = $2", [
        req.user.id,
        req.params.emailId,
      ]);

      res.json({ deleted: result.rowCount });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/integrations/labels", requireApiKey, async (req, res) => {
    try {
      const confidenceThreshold = await getConfidenceThreshold(req.integrationUser.id);
      const result = await dbPool.query(
        `
          select name, description
          from labels
          where user_id = $1
          order by lower(name), created_at desc
        `,
        [req.integrationUser.id],
      );

      res.json(
        result.rows.map((label) => ({
          name: label.name,
          description: renderTemplateDescription(label.description, confidenceThreshold),
        })),
      );
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/integrations/confidence-threshold", requireApiKey, async (req, res) => {
    try {
      res.json({ confidenceThreshold: await getConfidenceThreshold(req.integrationUser.id) });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/integrations/email-rules", requireApiKey, async (req, res) => {
    const input = await parseEmailRuleInput(req.integrationUser.id, req.body, { partial: false });

    if (!input.ok) {
      res.status(400).json({ error: input.error, labels: input.labels });
      return;
    }

    try {
      const rule = await upsertEmailRule(req.integrationUser.id, input.rule);
      res.status(201).json({ rule });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.put("/api/integrations/email-rules/:emailId", requireApiKey, async (req, res) => {
    const input = await parseEmailRuleInput(req.integrationUser.id, req.body, { partial: true });

    if (!input.ok) {
      res.status(400).json({ error: input.error, labels: input.labels });
      return;
    }

    try {
      const rule = await updateEmailRule(req.integrationUser.id, req.params.emailId, input.rule);

      if (!rule) {
        res.status(404).json({ error: "Email rule not found" });
        return;
      }

      res.json({ rule });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/integrations/email-rules/:emailId", requireApiKey, async (req, res) => {
    try {
      const result = await dbPool.query("delete from email_rules where user_id = $1 and email_id = $2", [
        req.integrationUser.id,
        req.params.emailId,
      ]);

      res.json({ deleted: result.rowCount });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/integrations/email-rules/query", requireApiKey, async (req, res) => {
    const query = buildEmailRuleQuery(req.body?.query ?? req.body);

    if (!query.ok) {
      res.status(400).json({ error: query.error });
      return;
    }

    try {
      const result = await dbPool.query(
        `
          select ${EMAIL_RULE_SELECT}
          from email_rules
          where user_id = $1 and (${query.sql})
          order by created_at desc
          limit $${query.values.length + 2}
        `,
        [req.integrationUser.id, ...query.values, parseQueryLimit(req.body?.limit)],
      );

      res.json({ rules: result.rows.map(mapEmailRuleRow) });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/integrations/email/labels/add", requireApiKey, async (req, res) => {
    await modifyMessageLabels(req, res, "add");
  });

  app.post("/api/integrations/email/labels/remove", requireApiKey, async (req, res) => {
    await modifyMessageLabels(req, res, "remove");
  });

  app.post("/api/integrations/email/drafts/reply", requireApiKey, async (req, res) => {
    const input = parseDraftInput(req.body);

    if (!input.ok) {
      res.status(400).json({ error: input.error });
      return;
    }

    try {
      const account = await getUserEmailAccount(req.integrationUser.id, input.accountEmail);
      if (!account) {
        res.status(404).json({ error: "Email account not found for this API key" });
        return;
      }

      if (account.provider !== "gmail") {
        res.status(501).json({ error: `${account.provider} draft replies are not implemented yet` });
        return;
      }

      const accessToken = await getValidEmailAccountAccessToken(account);
      const draft = await createGmailReplyDraft({ accessToken, account, input });

      res.status(201).json({
        accountEmail: account.email,
        emailId: input.emailId,
        draftId: draft.id,
        messageId: draft.message?.id ?? null,
        threadId: draft.message?.threadId ?? null,
      });
    } catch (error) {
      handleProviderError(res, error);
    }
  });
}

async function modifyMessageLabels(req, res, action) {
  const input = parseLabelMutationInput(req.body);

  if (!input.ok) {
    res.status(400).json({ error: input.error });
    return;
  }

  try {
    const account = await getUserEmailAccount(req.integrationUser.id, input.accountEmail);
    if (!account) {
      res.status(404).json({ error: "Email account not found for this API key" });
      return;
    }

    if (account.provider !== "gmail") {
      res.status(501).json({ error: `${account.provider} message labels are not implemented yet` });
      return;
    }

    const labels = await resolveProviderLabels(req.integrationUser.id, account.id, input.labels);
    if (!labels.ok) {
      res.status(labels.status).json({ error: labels.error, labels: labels.labels });
      return;
    }

    const accessToken = await getValidEmailAccountAccessToken(account);
    await modifyGmailMessageLabels({
      accessToken,
      emailId: input.emailId,
      addLabelIds: action === "add" ? labels.labels.map((label) => label.providerLabelId) : [],
      removeLabelIds: action === "remove" ? labels.labels.map((label) => label.providerLabelId) : [],
    });

    res.json({
      accountEmail: account.email,
      emailId: input.emailId,
      [action === "add" ? "added" : "removed"]: labels.labels,
    });
  } catch (error) {
    handleProviderError(res, error);
  }
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

async function requireApiKey(req, res, next) {
  const authorization = req.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    res.status(401).json({ error: "Provide an integration API key with Authorization: Bearer <token>" });
    return;
  }

  const result = await dbPool.query(
    `
      update integration_api_keys
      set last_used_at = now()
      where key_hash = $1
      returning user_id as "userId"
    `,
    [hashApiKey(token)],
  );

  const userId = result.rows[0]?.userId;
  if (!userId) {
    res.status(401).json({ error: "Invalid integration API key" });
    return;
  }

  req.integrationUser = { id: userId };
  next();
}

function parseLabelMutationInput(body) {
  const accountEmail = typeof body?.accountEmail === "string" ? body.accountEmail.trim().toLowerCase() : "";
  const emailId = typeof body?.emailId === "string" ? body.emailId.trim() : "";
  const labels = Array.isArray(body?.labels)
    ? body.labels.filter((label) => typeof label === "string").map((label) => label.trim()).filter(Boolean)
    : [];

  if (!accountEmail) {
    return { ok: false, error: "accountEmail is required" };
  }

  if (!emailId) {
    return { ok: false, error: "emailId is required" };
  }

  if (labels.length === 0) {
    return { ok: false, error: "labels must include at least one label name" };
  }

  return { ok: true, accountEmail, emailId, labels: [...new Set(labels)] };
}

function parseDraftInput(body) {
  const accountEmail = typeof body?.accountEmail === "string" ? body.accountEmail.trim().toLowerCase() : "";
  const emailId = typeof body?.emailId === "string" ? body.emailId.trim() : "";
  const bodyText = typeof body?.bodyText === "string" ? body.bodyText : "";
  const bodyHtml = typeof body?.bodyHtml === "string" ? body.bodyHtml : "";
  const replyAll = Boolean(body?.replyAll);

  if (!accountEmail) {
    return { ok: false, error: "accountEmail is required" };
  }

  if (!emailId) {
    return { ok: false, error: "emailId is required" };
  }

  if (!bodyText.trim() && !bodyHtml.trim()) {
    return { ok: false, error: "bodyText or bodyHtml is required" };
  }

  return { ok: true, accountEmail, emailId, bodyText, bodyHtml, replyAll };
}

async function resolveAppLabelsByName(userId, labelsApplied) {
  const requested = labelsApplied.map((label) => label.trim()).filter(Boolean);
  const uniqueRequested = [...new Map(requested.map((label) => [label.toLowerCase(), label])).values()];

  if (uniqueRequested.length === 0) {
    return { ok: true, labels: [] };
  }

  const result = await dbPool.query(
    `
      select name
      from labels
      where user_id = $1 and lower(name) = any($2::text[])
    `,
    [userId, uniqueRequested.map((label) => label.toLowerCase())],
  );
  const labelsByLowerName = new Map(result.rows.map((label) => [label.name.toLowerCase(), label.name]));
  const missing = uniqueRequested.filter((label) => !labelsByLowerName.has(label.toLowerCase()));

  if (missing.length > 0) {
    return {
      ok: false,
      error: "labelsApplied contains labels that do not exist",
      labels: missing,
    };
  }

  return { ok: true, labels: uniqueRequested.map((label) => labelsByLowerName.get(label.toLowerCase())) };
}

async function parseEmailRuleInput(userId, body, { partial }) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Request body must be an object" };
  }

  if (!partial) {
    for (const field of EMAIL_RULE_REQUIRED_FIELDS) {
      if (!(field in body)) {
        return { ok: false, error: `${field} is required` };
      }
    }
  }

  const rule = {};
  const stringFields = ["emailId", "threadId", "fromEmail", "fromName", "subject", "snippet"];

  for (const field of stringFields) {
    if (field in body) {
      if (typeof body[field] !== "string" || body[field].trim().length === 0) {
        return { ok: false, error: `${field} must be a non-empty string` };
      }

      rule[field] = body[field].trim();
    }
  }

  if ("confidence" in body) {
    const confidence = Number(body.confidence);

    if (!Number.isFinite(confidence)) {
      return { ok: false, error: "confidence must be a number" };
    }

    rule.confidence = confidence;
  }

  if ("labelsApplied" in body) {
    if (!Array.isArray(body.labelsApplied) || body.labelsApplied.some((label) => typeof label !== "string")) {
      return { ok: false, error: "labelsApplied must be an array of strings" };
    }

    const labels = await resolveAppLabelsByName(userId, body.labelsApplied);
    if (!labels.ok) {
      return labels;
    }

    rule.labelsApplied = labels.labels;
  }

  if ("isPending" in body) {
    if (typeof body.isPending !== "boolean") {
      return { ok: false, error: "isPending must be a boolean" };
    }

    rule.isPending = body.isPending;
  } else if (!partial) {
    rule.isPending = true;
  }

  if (partial && Object.keys(rule).length === 0) {
    return { ok: false, error: "At least one email rule field is required" };
  }

  return { ok: true, rule };
}

async function upsertEmailRule(userId, rule) {
  const result = await dbPool.query(
    `
      insert into email_rules (
        id, user_id, email_id, thread_id, from_email, from_name, subject,
        snippet, confidence, labels_applied, is_pending, metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      on conflict (user_id, email_id) do update
      set thread_id = excluded.thread_id,
          from_email = excluded.from_email,
          from_name = excluded.from_name,
          subject = excluded.subject,
          snippet = excluded.snippet,
          confidence = excluded.confidence,
          labels_applied = excluded.labels_applied,
          is_pending = excluded.is_pending,
          metadata = excluded.metadata,
          updated_at = now()
      returning ${EMAIL_RULE_SELECT}
    `,
    [
      crypto.randomUUID(),
      userId,
      rule.emailId,
      rule.threadId,
      rule.fromEmail,
      rule.fromName,
      rule.subject,
      rule.snippet,
      rule.confidence,
      rule.labelsApplied,
      rule.isPending,
      JSON.stringify(rule.metadata ?? {}),
    ],
  );

  return mapEmailRuleRow(result.rows[0]);
}

async function updateEmailRule(userId, emailId, rule) {
  const updates = [];
  const values = [userId, emailId];

  for (const [field, value] of Object.entries(rule)) {
    const column = EMAIL_RULE_COLUMNS[field];

    if (!column || field === "emailId") {
      continue;
    }

    if (field === "metadata") {
      values.push(JSON.stringify(value));
    } else {
      values.push(value);
    }

    updates.push(`${column} = $${values.length}`);
  }

  if (updates.length === 0) {
    return null;
  }

  const result = await dbPool.query(
    `
      update email_rules
      set ${updates.join(", ")}, updated_at = now()
      where user_id = $1 and email_id = $2
      returning ${EMAIL_RULE_SELECT}
    `,
    values,
  );

  return result.rows[0] ? mapEmailRuleRow(result.rows[0]) : null;
}

function buildEmailRuleQuery(query, parameterOffset = 2) {
  const values = [];
  const parsed = buildEmailRuleQueryNode(query, values, parameterOffset);

  if (!parsed.ok) {
    return parsed;
  }

  return { ok: true, sql: parsed.sql, values };
}

function buildEmailRuleQueryNode(node, values, parameterOffset) {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return { ok: false, error: "query must be an object" };
  }

  if (Array.isArray(node.rules) || Array.isArray(node.conditions)) {
    const operator = normalizeLogicalOperator(node.operator ?? node.logic ?? "AND");
    const conditions = node.rules ?? node.conditions;

    if (!operator) {
      return { ok: false, error: "query operator must be AND or OR" };
    }

    if (conditions.length === 0) {
      return { ok: false, error: "query group must include at least one rule" };
    }

    const parts = [];
    for (const condition of conditions) {
      const parsed = buildEmailRuleQueryNode(condition, values, parameterOffset);

      if (!parsed.ok) {
        return parsed;
      }

      parts.push(`(${parsed.sql})`);
    }

    return { ok: true, sql: parts.join(` ${operator} `) };
  }

  return buildEmailRuleCondition(node, values, parameterOffset);
}

function buildEmailRuleCondition(condition, values, parameterOffset) {
  const field = EMAIL_RULE_QUERY_FIELDS[condition.field];
  const equivalence = normalizeEquivalence(condition.equivalence ?? condition.operator);

  if (!field) {
    return { ok: false, error: "query field must be one of fromEmail, fromName, subject, isPending" };
  }

  if (!equivalence) {
    return { ok: false, error: "query equivalence must be equals, notEquals, or contains" };
  }

  if (field.type === "boolean") {
    if (equivalence === "contains") {
      return { ok: false, error: "contains is not supported for isPending" };
    }

    if (typeof condition.value !== "boolean") {
      return { ok: false, error: "isPending query value must be a boolean" };
    }

    values.push(condition.value);
    return {
      ok: true,
      sql: `${field.column} ${equivalence === "equals" ? "=" : "<>"} $${values.length + parameterOffset - 1}`,
    };
  }

  if (typeof condition.value !== "string") {
    return { ok: false, error: `${condition.field} query value must be a string` };
  }

  if (equivalence === "contains") {
    values.push(`%${escapeLike(condition.value)}%`);
    return { ok: true, sql: `${field.column} ilike $${values.length + parameterOffset - 1} escape '\\'` };
  }

  values.push(condition.value);
  return {
    ok: true,
    sql: `${field.column} ${equivalence === "equals" ? "=" : "<>"} $${values.length + parameterOffset - 1}`,
  };
}

function normalizeLogicalOperator(operator) {
  const normalized = String(operator).toUpperCase();
  return normalized === "AND" || normalized === "OR" ? normalized : null;
}

function normalizeEquivalence(equivalence) {
  const normalized = String(equivalence ?? "").replace(/[\s_-]/g, "").toLowerCase();

  if (normalized === "equals" || normalized === "eq") {
    return "equals";
  }

  if (normalized === "notequals" || normalized === "neq") {
    return "notEquals";
  }

  if (normalized === "contains" || normalized === "containsstring") {
    return "contains";
  }

  return null;
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function parseQueryLimit(value) {
  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    return 100;
  }

  return limit;
}

function parseRulePageSize(value) {
  const pageSize = Number(value);
  return [10, 25, 50].includes(pageSize) ? pageSize : 10;
}

function parseRulePage(value) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function parsePendingFilter(value) {
  if (value === "pending") {
    return true;
  }

  if (value === "not-pending") {
    return false;
  }

  return null;
}

function mapEmailRuleRow(row) {
  return {
    id: row.id,
    emailId: row.emailId,
    threadId: row.threadId,
    fromEmail: row.fromEmail,
    fromName: row.fromName,
    subject: row.subject,
    snippet: row.snippet,
    confidence: Number(row.confidence),
    labelsApplied: row.labelsApplied ?? [],
    isPending: row.isPending,
    ...(row.metadata ?? {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function emailRulesToCsv(rules) {
  const requiredHeaders = [
    "emailId",
    "threadId",
    "fromEmail",
    "fromName",
    "subject",
    "snippet",
    "confidence",
    "labelsApplied",
    "isPending",
  ];
  const reservedHeaders = new Set([...requiredHeaders, "id", "createdAt", "updatedAt"]);
  const metadataHeaders = [
    ...new Set(
      rules.flatMap((rule) =>
        Object.keys(rule).filter((key) => !reservedHeaders.has(key) && rule[key] !== undefined && rule[key] !== null),
      ),
    ),
  ].sort();
  const headers = [...requiredHeaders, ...metadataHeaders];
  const rows = rules.map((rule) =>
    headers.map((header) => {
      const value = rule[header];

      if (Array.isArray(value)) {
        return value.join(", ");
      }

      if (value === null || value === undefined) {
        return "";
      }

      return String(value);
    }),
  );

  return [headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

function escapeCsvCell(value) {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function renderTemplateDescription(description, confidenceThreshold) {
  return String(description ?? "").split("{confidenceThreshold}").join(String(confidenceThreshold));
}

async function getUserEmailAccount(userId, accountEmail) {
  await ensureSsoEmailAccount(userId);

  const result = await dbPool.query(
    `
      select id, provider, email, access_token, refresh_token, token_expires_at as "tokenExpiresAt"
      from email_accounts
      where user_id = $1 and lower(email) = lower($2)
      limit 1
    `,
    [userId, accountEmail],
  );

  return result.rows[0] ?? null;
}

async function resolveProviderLabels(userId, emailAccountId, labelNames) {
  const result = await dbPool.query(
    `
      select lower(l.name) as "lookupName",
             l.id as "labelId",
             l.name,
             las.provider_label_id as "providerLabelId",
             las.sync_status as "syncStatus"
      from labels l
      left join label_account_syncs las on las.label_id = l.id and las.email_account_id = $2
      where l.user_id = $1 and lower(l.name) = any($3::text[])
    `,
    [userId, emailAccountId, labelNames.map((label) => label.toLowerCase())],
  );
  const labelsByName = new Map();

  for (const row of result.rows) {
    const list = labelsByName.get(row.lookupName) ?? [];
    list.push(row);
    labelsByName.set(row.lookupName, list);
  }

  const resolved = [];
  const errors = [];

  for (const requestedName of labelNames) {
    const matches = labelsByName.get(requestedName.toLowerCase()) ?? [];

    if (matches.length === 0) {
      errors.push({ name: requestedName, error: "Label was not found" });
      continue;
    }

    if (matches.length > 1) {
      errors.push({ name: requestedName, error: "More than one app label uses this name" });
      continue;
    }

    const label = matches[0];
    const repairedSync = await ensureLabelSyncedToAccount(userId, label.labelId, emailAccountId);

    if (repairedSync?.sync_status !== "synced" || !repairedSync.provider_label_id) {
      errors.push({ name: requestedName, error: repairedSync?.last_error || "Label is not synced to this email account yet" });
      continue;
    }

    resolved.push({ name: label.name, providerLabelId: repairedSync.provider_label_id });
  }

  if (errors.length > 0) {
    return { ok: false, status: 422, error: "One or more labels could not be resolved", labels: errors };
  }

  return { ok: true, labels: resolved };
}

async function modifyGmailMessageLabels({ accessToken, emailId, addLabelIds, removeLabelIds }) {
  const response = await providerFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(emailId)}/modify`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ addLabelIds, removeLabelIds }),
    },
  );

  return response.json();
}

async function createGmailReplyDraft({ accessToken, account, input }) {
  const original = await fetchGmailMessageMetadata(accessToken, input.emailId);
  const raw = buildReplyMessage({ accountEmail: account.email, original, input });
  const response = await providerFetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", accessToken, {
    method: "POST",
    body: JSON.stringify({
      message: {
        raw,
        threadId: original.threadId,
      },
    }),
  });

  return response.json();
}

async function fetchGmailMessageMetadata(accessToken, emailId) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(emailId)}`);
  url.searchParams.set("format", "metadata");
  url.searchParams.set("metadataHeaders", "From");
  url.searchParams.append("metadataHeaders", "To");
  url.searchParams.append("metadataHeaders", "Cc");
  url.searchParams.append("metadataHeaders", "Subject");
  url.searchParams.append("metadataHeaders", "Message-ID");
  url.searchParams.append("metadataHeaders", "References");

  const response = await providerFetch(url.toString(), accessToken, { method: "GET" });
  return response.json();
}

function buildReplyMessage({ accountEmail, original, input }) {
  const headers = getGmailHeaders(original);
  const from = extractEmailAddress(headers.from);
  const to = input.replyAll ? buildReplyAllRecipients(headers, accountEmail) : from;
  const subject = normalizeReplySubject(headers.subject ?? "");
  const messageId = headers["message-id"];
  const references = [headers.references, messageId].filter(Boolean).join(" ");
  const boundary = `reply_${crypto.randomBytes(12).toString("hex")}`;
  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    messageId ? `In-Reply-To: ${messageId}` : null,
    references ? `References: ${references}` : null,
    "MIME-Version: 1.0",
  ].filter(Boolean);

  if (input.bodyHtml.trim()) {
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`, "", `--${boundary}`);
    lines.push("Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 7bit", "", input.bodyText || "");
    lines.push(`--${boundary}`);
    lines.push("Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: 7bit", "", input.bodyHtml);
    lines.push(`--${boundary}--`);
  } else {
    lines.push("Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 7bit", "", input.bodyText);
  }

  return base64UrlEncode(lines.join("\r\n"));
}

function getGmailHeaders(message) {
  const headers = {};

  for (const header of message.payload?.headers ?? []) {
    headers[header.name.toLowerCase()] = header.value;
  }

  return headers;
}

function buildReplyAllRecipients(headers, accountEmail) {
  const recipients = [headers.from, headers.to, headers.cc]
    .filter(Boolean)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => extractEmailAddress(value).toLowerCase() !== accountEmail.toLowerCase());

  return [...new Set(recipients)].join(", ");
}

function extractEmailAddress(value = "") {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim();
}

function normalizeReplySubject(subject) {
  return /^re:/i.test(subject) ? subject : `Re: ${subject || "(no subject)"}`;
}

async function providerFetch(url, accessToken, options) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Provider request failed with ${response.status}: ${text.slice(0, 300)}`);
  }

  return response;
}

function createApiKey() {
  return `${API_KEY_PREFIX}_${crypto.randomBytes(32).toString("base64url")}`;
}

function hashApiKey(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function base64UrlEncode(value) {
  return Buffer.from(value, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

function handleProviderError(res, error) {
  console.error("Integration provider request failed:", error);
  res.status(502).json({ error: error.message || "Provider request failed" });
}

function handleError(res, error) {
  console.error("Integration API failed:", error);
  res.status(500).json({ error: "Integration request failed" });
}
