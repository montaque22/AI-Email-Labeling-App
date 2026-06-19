import crypto from "node:crypto";
import { getRenderedAiPromptBundle } from "./ai-prompts.js";
import { ensureUnemailableSystemLabel, UNEMAILABLE_SYSTEM_LABEL_NAME } from "./labels.js";
import { resolveRequestUser } from "./session.js";
import { dbPool } from "./db.js";
import { ensureSsoEmailAccount, getConnectedEmailAccounts, getValidEmailAccountAccessToken } from "./email-accounts.js";
import {
  createImapDraft,
  fetchImapEmailContextById,
  findImapMessageAccountMatch,
  searchImapEmailContexts,
  searchRecentImapEmailContexts,
  moveImapMessageToFolders,
} from "./imap-provider.js";
import { ensureLabelSyncedToAccount } from "./label-sync.js";
import { getConfidenceThreshold } from "./settings.js";
import { emitWebhookEvent } from "./webhooks.js";
import { deleteAllSystemLogs, exportSystemLogs, listSystemLogs, logSystemEvent } from "./system-logs.js";

const API_KEY_PREFIX = "n8n";
const GMAIL_MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify";
const EMAIL_RULE_REQUIRED_FIELDS = [
  "emailId",
  "threadId",
  "fromEmail",
  "fromName",
  "subject",
  "snippet",
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
export const EMAIL_RULE_SELECT = `
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

  await dbPool.query(`
    create table if not exists integration_metric_events (
      id uuid primary key,
      user_id text not null references "user"(id) on delete cascade,
      event_type text not null,
      email_id text,
      account_email text,
      metadata jsonb not null default '{}',
      created_at timestamptz not null default now()
    )
  `);
  await dbPool.query("create index if not exists integration_metric_events_user_id_idx on integration_metric_events(user_id)");
  await dbPool.query(
    "create index if not exists integration_metric_events_type_created_idx on integration_metric_events(user_id, event_type, created_at)",
  );
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
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const conditions = ["user_id = $1"];
    const values = [req.user.id];

    if (pendingFilter !== null) {
      values.push(pendingFilter);
      conditions.push(`is_pending = $${values.length}`);
    }

    addRuleSearchConditions(search, conditions, values);

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

      const rules = await hydrateRuleAccountEmails(req.user.id, result.rows.map(mapEmailRuleRow));

      res.json({
        total: count.rows[0]?.count ?? 0,
        page,
        pageSize,
        rules,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/overview", requireSession, async (req, res) => {
    try {
      const [todayLabeled, syncedLabels, connectedAccounts, ruleCounts, recentRules] = await Promise.all([
        getMetricEventCountForToday(req.user.id, "email_labeled"),
        getSyncedLabelCount(req.user.id),
        getConnectedEmailAccountCount(req.user.id),
        getRuleStatusCounts(req.user.id),
        getRecentRules(req.user.id, 7),
      ]);

      res.json({
        todayLabeled,
        syncedLabels,
        connectedAccounts,
        pendingRules: ruleCounts.pending,
        nonPendingRules: ruleCounts.nonPending,
        recentRules,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/metrics", requireSession, async (req, res) => {
    try {
      const [rulesCreated, ruleStatus, emailsLabeled, draftsCreated] = await Promise.all([
        getRulesCreatedTimeline(req.user.id),
        getRuleStatusCounts(req.user.id),
        getMetricEventTimeline(req.user.id, "email_labeled"),
        getMetricEventTimeline(req.user.id, "draft_created"),
      ]);

      res.json({
        rulesCreated,
        ruleStatus,
        emailsLabeled,
        draftsCreated,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/system-logs", requireSession, async (req, res) => {
    try {
      res.json({
        logs: await listSystemLogs(req.user.id, {
          category: typeof req.query.category === "string" ? req.query.category : "all",
          limit: Number(req.query.limit ?? 100),
        }),
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/system-logs/export", requireSession, async (req, res) => {
    try {
      res.json({
        logs: await exportSystemLogs(req.user.id, {
          category: typeof req.query.category === "string" ? req.query.category : "all",
        }),
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/system-logs", requireSession, async (req, res) => {
    try {
      res.json({ deleted: await deleteAllSystemLogs(req.user.id) });
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
      const csv = emailRulesToCsv(await hydrateRuleAccountEmails(req.user.id, result.rows.map(mapEmailRuleRow)));

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="email-rules.csv"');
      res.send(csv);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/email-rules/email-search", requireSession, async (req, res) => {
    const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
    const accountEmail = typeof req.body?.accountEmail === "string" ? req.body.accountEmail.trim().toLowerCase() : "";

    if (!query && !accountEmail) {
      res.status(400).json({ error: "Enter a subject search or choose an account" });
      return;
    }

    try {
      res.json({ emails: await searchConnectedEmailsForRules(req.user.id, { query, accountEmail }) });
    } catch (error) {
      handleProviderError(res, error);
    }
  });

  app.post("/api/email-rules/review", requireSession, async (req, res) => {
    const input = await parseManualRuleReviewInput(req.user.id, req.body);

    if (!input.ok) {
      res.status(400).json({ error: input.error, labels: input.labels });
      return;
    }

    try {
      const currentRule = await getEmailRuleByEmailId(req.user.id, input.rule.emailId);
      const applied = await applySingleLabelToEmail(req.user.id, {
        emailId: input.rule.emailId,
        subject: input.rule.subject,
        labelName: input.rule.labelsApplied[0],
        removeLabelNames: currentRule?.labelsApplied ?? [],
        source: "manual-rule-review",
      });
      const rule = await upsertEmailRule(req.user.id, {
        ...input.rule,
        confidence: 1,
        isPending: false,
        metadata: {
          labelReasons: input.rule.metadata.labelReasons,
          accountEmail: applied.accountEmail,
          source: "manual-rule-review",
        },
      });

      await emitWebhookEvent(req.user.id, currentRule ? "email_rule.modified" : "email_rule.created", {
        rule,
        payload: input.rule,
        previous: currentRule,
      });
      res.status(currentRule ? 200 : 201).json({ rule });
    } catch (error) {
      handleProviderError(res, error);
    }
  });

  app.get("/api/email-rules/:emailId", requireSession, async (req, res) => {
    try {
      const rule = await getEmailRuleByEmailId(req.user.id, req.params.emailId);

      if (!rule) {
        res.status(404).json({ error: "Email rule not found" });
        return;
      }

      res.json({ rule: (await hydrateRuleAccountEmails(req.user.id, [rule]))[0] });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.put("/api/email-rules/:emailId/review", requireSession, async (req, res) => {
    const labelsApplied = Array.isArray(req.body?.labelsApplied)
      ? req.body.labelsApplied.filter((label) => typeof label === "string").map((label) => label.trim()).filter(Boolean)
      : null;
    const labelReasonsInput = parseLabelReasons(req.body?.labelReasons ?? {}, { allowEmpty: true });

    if (!labelsApplied) {
      res.status(400).json({ error: "labelsApplied must be an array of strings" });
      return;
    }

    if (!labelReasonsInput.ok) {
      res.status(400).json({ error: labelReasonsInput.error });
      return;
    }

    const uniqueLabelsApplied = [...new Set(labelsApplied)];
    if (uniqueLabelsApplied.length !== 1) {
      res.status(400).json({ error: "Select exactly one label before marking the rule reviewed" });
      return;
    }

    const resolvedLabels = await resolveAppLabelsByName(req.user.id, uniqueLabelsApplied);
    if (!resolvedLabels.ok) {
      res.status(400).json({ error: resolvedLabels.error, labels: resolvedLabels.labels });
      return;
    }

    const unexpectedReasons = Object.keys(labelReasonsInput.labelReasons).filter(
      (label) => !resolvedLabels.labels.some((selectedLabel) => selectedLabel.toLowerCase() === label.toLowerCase()),
    );
    if (unexpectedReasons.length > 0) {
      res.status(400).json({ error: "labelReasons can only include labels listed in labelsApplied", labels: unexpectedReasons });
      return;
    }

    try {
      const currentRule = await getEmailRuleByEmailId(req.user.id, req.params.emailId);
      if (!currentRule) {
        res.status(404).json({ error: "Email rule not found" });
        return;
      }

      const applied = await applySingleLabelToEmail(req.user.id, {
        emailId: currentRule.emailId,
        subject: currentRule.subject,
        labelName: resolvedLabels.labels[0],
        removeLabelNames: currentRule.labelsApplied ?? [],
        source: "rule-review",
      });
      const normalizedReasons = normalizeLabelReasons(resolvedLabels.labels, labelReasonsInput.labelReasons);
      const result = await dbPool.query(
        `
          update email_rules
          set labels_applied = $3,
              is_pending = false,
              confidence = 1,
              metadata = (metadata - 'reason' - 'userQuestion' - 'ruleSuggestion' - 'recommendedAction') || jsonb_build_object('labelReasons', $4::jsonb, 'accountEmail', $5::text),
              updated_at = now()
          where user_id = $1 and email_id = $2
          returning ${EMAIL_RULE_SELECT}
        `,
        [req.user.id, req.params.emailId, resolvedLabels.labels, JSON.stringify(normalizedReasons), applied.accountEmail],
      );

      if (!result.rows[0]) {
        res.status(404).json({ error: "Email rule not found" });
        return;
      }

      const rule = mapEmailRuleRow(result.rows[0]);
      await emitWebhookEvent(req.user.id, "email_rule.modified", {
        rule,
        changes: {
          labelsApplied: resolvedLabels.labels,
          labelReasons: normalizedReasons,
          isPending: false,
          confidence: 1,
          clearedFields: ["reason", "userQuestion", "ruleSuggestion", "recommendedAction"],
        },
      });
      res.json({ rule });
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
      const deletedResult = await dbPool.query(
        `
          delete from email_rules
          where user_id = $1 and email_id = any($2::text[])
          returning ${EMAIL_RULE_SELECT}
        `,
        [req.user.id, [...new Set(emailIds)]],
      );
      const deletedRules = deletedResult.rows.map(mapEmailRuleRow);

      for (const rule of deletedRules) {
        await emitWebhookEvent(req.user.id, "email_rule.deleted", { rule });
      }

      res.json({ deleted: deletedResult.rowCount });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/email-rules/:emailId", requireSession, async (req, res) => {
    try {
      const result = await dbPool.query(
        `
          delete from email_rules
          where user_id = $1 and email_id = $2
          returning ${EMAIL_RULE_SELECT}
        `,
        [req.user.id, req.params.emailId],
      );
      const rule = result.rows[0] ? mapEmailRuleRow(result.rows[0]) : null;

      if (rule) {
        await emitWebhookEvent(req.user.id, "email_rule.deleted", { rule });
      }

      res.json({ deleted: result.rowCount });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/integrations/core-content", requireApiKey, async (req, res) => {
    try {
      const result = await getRenderedAiPromptBundle(req.integrationUser.id);
      await logEndpointCall(req.integrationUser.id, "GET /api/integrations/core-content", {}, "success", result);
      res.json(result);
    } catch (error) {
      await logEndpointCall(req.integrationUser.id, "GET /api/integrations/core-content", {}, "error", { error: error.message });
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

      const responsePayload = { rules: await hydrateRuleAccountEmails(req.integrationUser.id, result.rows.map(mapEmailRuleRow)) };
      await logEndpointCall(req.integrationUser.id, "POST /api/integrations/email-rules/query", req.body, "success", {
        count: responsePayload.rules.length,
      });
      res.json(responsePayload);
    } catch (error) {
      await logEndpointCall(req.integrationUser.id, "POST /api/integrations/email-rules/query", req.body, "error", { error: error.message });
      handleError(res, error);
    }
  });

  app.post("/api/integrations/email/labels/add", requireApiKey, async (req, res) => {
    const input = await parseLabelClassificationInput(req.integrationUser.id, req.body);

    if (!input.ok) {
      await tryApplyUnemailableFromPayload(req.integrationUser.id, req.body, input.error, "integration");
      res.status(400).json({ error: input.error, labels: input.labels });
      return;
    }

    try {
      const result = await classifyEmailWithLabelCandidates(req.integrationUser.id, input.rule, { source: "integration" });
      await logEndpointCall(req.integrationUser.id, "POST /api/integrations/email/labels/add", req.body, "success", result);
      res.json(result);
    } catch (error) {
      await logEndpointCall(req.integrationUser.id, "POST /api/integrations/email/labels/add", req.body, "error", { error: error.message });
      handleProviderError(res, error);
    }
  });

  app.post("/api/integrations/email/labels/remove", requireApiKey, async (req, res) => {
    await modifyMessageLabels(req, res, "remove");
  });

  app.post("/api/integrations/email/labels/evaluate", requireApiKey, async (req, res) => {
    const input = await parseLabelClassificationInput(req.integrationUser.id, req.body);

    if (!input.ok) {
      await tryApplyUnemailableFromPayload(req.integrationUser.id, req.body, input.error, "integration");
      res.status(400).json({ error: input.error, labels: input.labels });
      return;
    }

    try {
      const result = await classifyEmailWithLabelCandidates(req.integrationUser.id, input.rule, { source: "integration" });
      await logEndpointCall(req.integrationUser.id, "POST /api/integrations/email/labels/evaluate", req.body, "success", result);
      res.json(result);
    } catch (error) {
      await logEndpointCall(req.integrationUser.id, "POST /api/integrations/email/labels/evaluate", req.body, "error", { error: error.message });
      handleProviderError(res, error);
    }
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

      const accessToken = await getValidEmailAccountAccessToken(account);
      const draft = await createProviderReplyDraft({ accessToken, account, input });
      await recordMetricEvent(req.integrationUser.id, "draft_created", {
        emailId: input.emailId,
        accountEmail: account.email,
        metadata: { provider: account.provider, draftId: draft.id },
      });
      const draftResponse = {
        accountEmail: account.email,
        emailId: input.emailId,
        draftId: draft.id,
        messageId: draft.message?.id ?? draft.id ?? null,
        threadId: draft.message?.threadId ?? draft.conversationId ?? null,
      };
      await emitWebhookEvent(req.integrationUser.id, "email.drafted", buildDraftWebhookPayload({ account, input, draft }));
      await logEndpointCall(req.integrationUser.id, "POST /api/integrations/email/drafts/reply", req.body, "success", draftResponse);

      res.status(201).json(draftResponse);
    } catch (error) {
      await logEndpointCall(req.integrationUser.id, "POST /api/integrations/email/drafts/reply", req.body, "error", { error: error.message });
      handleProviderError(res, error);
    }
  });
}

async function logEndpointCall(userId, endpoint, payload, status, response) {
  await logSystemEvent(userId, {
    category: "endpoints",
    eventName: endpoint,
    status: status === "success" ? "success" : "error",
    message: `${endpoint} ${status === "success" ? "succeeded" : "failed"}`,
    payload: { request: payload, response },
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

    if (!["gmail", "imap", "yahoo"].includes(account.provider)) {
      res.status(501).json({ error: `${account.provider} message labels are not implemented yet` });
      return;
    }

    const labels = await resolveProviderLabels(req.integrationUser.id, account.id, input.labels);
    if (!labels.ok) {
      res.status(labels.status).json({ error: labels.error, labels: labels.labels });
      return;
    }

    if (account.provider === "gmail") {
      const accessToken = await getValidEmailAccountAccessToken(account);
      await modifyGmailMessageLabels({
        accessToken,
        emailId: input.emailId,
        addLabelIds: action === "add" ? labels.labels.map((label) => label.providerLabelId) : [],
        removeLabelIds: action === "remove" ? labels.labels.map((label) => label.providerLabelId) : [],
      });
    } else {
      const accessToken = account.provider === "yahoo"
        ? await getValidEmailAccountAccessToken(account)
        : "";
      await moveImapMessageToFolders({
        account,
        emailId: input.emailId,
        addFolders: action === "add" ? labels.labels.map((label) => label.providerLabelId) : [],
        removeFolders: action === "remove" ? labels.labels.map((label) => label.providerLabelId) : [],
        accessToken,
      });
    }

    const emailContext = await getEmailContextForWebhook(req.integrationUser.id, {
      emailId: input.emailId,
      accountEmail: account.email,
    });
    if (action === "add") {
      await recordMetricEvent(req.integrationUser.id, "email_labeled", {
        emailId: input.emailId,
        accountEmail: account.email,
        metadata: { provider: account.provider, labels: labels.labels.map((label) => label.name) },
      });
    }

    const responsePayload = {
      accountEmail: account.email,
      emailId: input.emailId,
      [action === "add" ? "added" : "removed"]: labels.labels,
    };
    await emitWebhookEvent(req.integrationUser.id, "email.labels_updated", {
      emailId: input.emailId,
      accountEmail: account.email,
      added: action === "add" ? labels.labels.map((label) => label.name) : [],
      removed: action === "remove" ? labels.labels.map((label) => label.name) : [],
      labels: labels.labels,
      ...buildLabelUpdatedEmailContextPayload(emailContext),
    });
    await logEndpointCall(req.integrationUser.id, `POST /api/integrations/email/labels/${action}`, req.body, "success", responsePayload);

    res.json(responsePayload);
  } catch (error) {
    await logEndpointCall(req.integrationUser.id, `POST /api/integrations/email/labels/${action}`, req.body, "error", { error: error.message });
    handleProviderError(res, error);
  }
}

export async function classifyEmailWithLabelCandidates(userId, rule, { source = "integration" } = {}) {
  const threshold = await getConfidenceThreshold(userId);
  const target = await findConnectedMessageById(userId, rule.emailId, rule.subject);

  if (!target) {
    const error = new Error("Email was not found in connected email accounts");
    error.status = 404;
    throw error;
  }

  if (!["gmail", "imap", "yahoo"].includes(target.account.provider)) {
    const error = new Error(`${target.account.provider} message labels are not implemented yet`);
    error.status = 501;
    throw error;
  }

  const highestConfidence = rule.labelCandidates.reduce((highest, candidate) => Math.max(highest, candidate.confidence), 0);
  const highestCandidates = rule.labelCandidates.filter((candidate) => candidate.confidence === highestConfidence);
  const shouldAutoLabel = highestCandidates.length === 1 && highestConfidence >= threshold;
  const selectedCandidate = shouldAutoLabel ? highestCandidates[0] : null;

  const labels = shouldAutoLabel
    ? await applySingleLabelToEmail(userId, {
        emailId: rule.emailId,
        subject: rule.subject,
        labelName: selectedCandidate.labelName,
        removeLabelNames: [UNEMAILABLE_SYSTEM_LABEL_NAME],
        target,
        source,
      }).catch(async (error) => {
        await tryApplyUnemailableLabel(userId, {
          emailId: rule.emailId,
          subject: rule.subject,
          target,
          source,
          reason: error.message,
        });
        throw error;
      })
    : { labels: [] };

  if (shouldAutoLabel) {
    return {
      action: "labels_added",
      threshold,
      confidence: highestConfidence,
      accountEmail: target.account.email,
      emailId: rule.emailId,
      added: labels.labels,
    };
  }

  const previousRule = await getEmailRuleByEmailId(userId, rule.emailId);
  await tryApplyUnemailableLabel(userId, {
    emailId: rule.emailId,
    subject: rule.subject,
    target,
    source,
    reason: shouldAutoLabel ? "Could not apply selected label." : "Confidence was below threshold or label candidates tied.",
  });
  const pendingRule = await upsertEmailRule(userId, {
    emailId: rule.emailId,
    threadId: rule.threadId,
    fromEmail: rule.fromEmail,
    fromName: rule.fromName,
    subject: rule.subject,
    snippet: rule.snippet,
    confidence: highestConfidence,
    labelsApplied: rule.labelCandidates.map((candidate) => candidate.labelName),
    isPending: true,
    metadata: {
      source,
      threshold,
      accountEmail: target.account.email,
      labelReasons: Object.fromEntries(rule.labelCandidates.map((candidate) => [candidate.labelName, candidate.reason])),
    },
  });
  await emitEmailRuleUpsertWebhook(userId, previousRule, pendingRule, rule);

  return {
    action: "pending_rule_created",
    threshold,
    confidence: highestConfidence,
    accountEmail: target.account.email,
    emailId: rule.emailId,
    rule: pendingRule,
  };
}

export async function tryApplyUnemailableLabel(userId, { emailId, subject = "", target = null, source = "integration", reason = "" }) {
  try {
    await ensureUnemailableSystemLabel(userId);
    return applySingleLabelToEmail(userId, {
      emailId,
      subject,
      labelName: UNEMAILABLE_SYSTEM_LABEL_NAME,
      target,
      source: `${source}:unemailable`,
    });
  } catch (error) {
    console.warn(`Could not apply ${UNEMAILABLE_SYSTEM_LABEL_NAME} label:`, reason || error.message);
    return null;
  }
}

async function tryApplyUnemailableFromPayload(userId, payload, reason, source) {
  const emailId = typeof payload?.emailId === "string" ? payload.emailId.trim() : "";
  if (!emailId) {
    return null;
  }

  return tryApplyUnemailableLabel(userId, {
    emailId,
    subject: typeof payload?.subject === "string" ? payload.subject : "",
    source,
    reason,
  });
}

export async function applySingleLabelToEmail(userId, { emailId, subject, labelName, removeLabelNames = [], target = null, source = "integration" }) {
  const messageTarget = target ?? await findConnectedMessageById(userId, emailId, subject);

  if (!messageTarget) {
    const error = new Error("Email was not found in connected email accounts");
    error.status = 404;
    throw error;
  }

  if (!["gmail", "imap", "yahoo"].includes(messageTarget.account.provider)) {
    const error = new Error(`${messageTarget.account.provider} message labels are not implemented yet`);
    error.status = 501;
    throw error;
  }

  const labels = await resolveProviderLabels(userId, messageTarget.account.id, [labelName]);

  if (!labels.ok) {
    const error = new Error(labels.error);
    error.status = labels.status;
    error.labels = labels.labels;
    throw error;
  }

  const syncedLabelsToRemove = await resolveOtherSyncedProviderLabels(userId, messageTarget.account.id, labelName);

  if (messageTarget.account.provider === "gmail") {
    const accessToken = await getValidEmailAccountAccessToken(messageTarget.account);
    await modifyGmailMessageLabels({
      accessToken,
      emailId,
      addLabelIds: labels.labels.map((label) => label.providerLabelId),
      removeLabelIds: syncedLabelsToRemove.map((label) => label.providerLabelId),
    });
  } else {
    const accessToken = messageTarget.account.provider === "yahoo"
      ? await getValidEmailAccountAccessToken(messageTarget.account)
      : "";
    await moveImapMessageToFolders({
      account: messageTarget.account,
      emailId,
      addFolders: labels.labels.map((label) => label.providerLabelId),
      removeFolders: syncedLabelsToRemove.map((label) => label.providerLabelId),
      accessToken,
    });
  }

  await recordMetricEvent(userId, "email_labeled", {
    emailId,
    accountEmail: messageTarget.account.email,
    metadata: { provider: messageTarget.account.provider, labels: labels.labels.map((label) => label.name), source },
  });
  await emitWebhookEvent(userId, "email.labels_updated", {
    emailId,
    accountEmail: messageTarget.account.email,
    added: labels.labels.map((label) => label.name),
    removed: syncedLabelsToRemove.map((label) => label.name),
    labels: labels.labels,
    source,
    ...buildLabelUpdatedEmailContextPayload(messageTarget),
  });

  return {
    accountEmail: messageTarget.account.email,
    emailId,
    labels: labels.labels,
  };
}

async function getEmailContextForWebhook(userId, { emailId, accountEmail = "", subject = "" }) {
  try {
    return await findConnectedEmailContextById(userId, { emailId, accountEmail, subject });
  } catch (error) {
    console.warn(`Could not fetch email context for label webhook ${emailId}:`, error.message);
    return null;
  }
}

function buildLabelUpdatedEmailContextPayload(target) {
  const email = target?.email;
  if (!email) {
    return {};
  }

  return {
    subject: email.subject || "",
    from: {
      email: email.fromEmail || "",
      name: email.fromName || "",
    },
    body: simplifyWebhookEmailBody(email.bodyText || email.snippet || ""),
  };
}

function simplifyWebhookEmailBody(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 8000);
}

export async function searchPollingCandidates(userId, lookbackHours) {
  const accounts = await getConnectedEmailAccounts(userId);
  const syncResult = await dbPool.query(
    `
      select las.email_account_id as "emailAccountId",
             las.provider_label_id as "providerLabelId",
             l.system_key as "systemKey"
      from label_account_syncs las
      join labels l on l.id = las.label_id
      where l.user_id = $1
        and las.provider_label_id is not null
    `,
    [userId],
  );
  const ignoredProviderLabels = new Map();
  const retryFolders = new Map();
  for (const row of syncResult.rows) {
    if (row.systemKey === "unemailable") {
      retryFolders.set(row.emailAccountId, row.providerLabelId);
      continue;
    }
    if (row.systemKey) {
      continue;
    }
    const labels = ignoredProviderLabels.get(row.emailAccountId) ?? new Set();
    labels.add(row.providerLabelId);
    ignoredProviderLabels.set(row.emailAccountId, labels);
  }

  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  const candidates = [];
  for (const account of accounts) {
    try {
      if (account.provider === "gmail") {
        assertGmailAccountHasRequiredScopes(account);
        const accessToken = await getValidEmailAccountAccessToken(account);
        const ignoredLabelIds = ignoredProviderLabels.get(account.id) ?? new Set();
        const messages = await searchRecentGmailPollingMessages(accessToken, account, since, ignoredLabelIds);
        candidates.push(...messages);
      } else if (["imap", "yahoo"].includes(account.provider)) {
        const accessToken = account.provider === "yahoo"
          ? await getValidEmailAccountAccessToken(account)
          : "";
        const messages = await searchRecentImapEmailContexts(account, { since, limit: 100, accessToken });
        const retryFolder = retryFolders.get(account.id);
        if (retryFolder) {
          try {
            messages.push(...await searchRecentImapEmailContexts(account, {
              since,
              limit: 100,
              folder: retryFolder,
              accessToken,
            }));
          } catch (error) {
            console.warn(`Polling retry-folder search failed for ${account.email}:`, error.message);
          }
        }
        candidates.push(...messages.map((email) => ({ account, email })));
      }
    } catch (error) {
      console.warn(`Polling search failed for ${account.provider} ${account.email}:`, error.message);
    }
  }

  return candidates;
}

async function searchRecentGmailPollingMessages(accessToken, account, since, ignoredLabelIds) {
  const results = [];
  let pageToken = "";
  let pageCount = 0;

  do {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("q", `in:inbox after:${Math.floor(since.getTime() / 1000)} -in:sent -in:drafts`);
    url.searchParams.set("maxResults", "100");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }
    const response = await providerFetch(url.toString(), accessToken, { method: "GET" });
    const data = await response.json();

    for (const item of data.messages ?? []) {
      const message = await fetchGmailMessageFull(accessToken, item.id);
      if ((message.labelIds ?? []).some((labelId) => ignoredLabelIds.has(labelId))) {
        continue;
      }
      results.push({ account, email: gmailMessageToRuleSearchResult(message, item.id) });
    }

    pageToken = data.nextPageToken ?? "";
    pageCount += 1;
  } while (pageToken && pageCount < 5);

  return results;
}

async function searchConnectedEmailsForRules(userId, { query, accountEmail, fromEmail = "" }) {
  const accounts = await getConnectedEmailAccounts(userId);
  const results = [];
  const selectedAccounts = accountEmail
    ? accounts.filter((account) => account.email.toLowerCase() === accountEmail)
    : accounts;

  if (accountEmail && selectedAccounts.length === 0) {
    const error = new Error("Email account not found");
    error.status = 404;
    throw error;
  }

  for (const account of selectedAccounts) {
    if (results.length >= 10) {
      break;
    }

    if (!["gmail", "imap", "yahoo"].includes(account.provider)) {
      continue;
    }

    try {
      if (account.provider === "gmail") {
        const accessToken = await getValidEmailAccountAccessToken(account);
        const emails = await searchGmailEmailsForRules(accessToken, { query, fromEmail }, 10 - results.length);
        results.push(...emails.map((email) => ({ ...email, accountEmail: account.email, provider: account.provider })));
      } else {
        const accessToken = account.provider === "yahoo"
          ? await getValidEmailAccountAccessToken(account)
          : "";
        const emails = await searchImapEmailContexts(
          account,
          { subject: query },
          10 - results.length,
          accessToken,
        );
        results.push(...emails
          .filter((email) => !fromEmail || emailMatchesFrom(email, fromEmail))
          .map((email) => ({ ...email, accountEmail: account.email, provider: account.provider })));
      }
    } catch (error) {
      if (error.status !== 404) {
        console.warn(`Rule email search failed for ${account.provider} ${account.email}:`, error.message);
      }
    }
  }

  return results.slice(0, 10);
}

export async function findConnectedEmailsForMcp(userId, payload = {}) {
  const emailId = typeof payload.emailId === "string" ? payload.emailId.trim() : "";
  const subject = typeof payload.subject === "string" ? payload.subject.trim() : "";
  const from = typeof payload.from === "string" ? payload.from.trim().toLowerCase() : "";
  const to = typeof payload.to === "string" ? payload.to.trim().toLowerCase() : "";

  if (!emailId && !subject && !from && !to) {
    return [];
  }

  if (emailId) {
    try {
      const match = await findConnectedEmailContextById(userId, { emailId, accountEmail: to, subject });
      if (from && !emailMatchesFrom(match.email, from)) {
        return [];
      }
      return [mcpEmailSearchResult(match)];
    } catch (error) {
      if (error.status === 404) {
        return [];
      }
      throw error;
    }
  }

  const candidates = await searchConnectedEmailsForRules(userId, { query: subject, accountEmail: to, fromEmail: from });
  return candidates
    .filter((email) => !subject || normalizeComparableSubject(email.subject).includes(normalizeComparableSubject(subject)))
    .filter((email) => !from || emailMatchesFrom(email, from))
    .slice(0, 10)
    .map((email) => ({
      accountEmail: email.accountEmail,
      provider: email.provider,
      emailId: email.emailId,
      threadId: email.threadId,
      fromEmail: email.fromEmail,
      fromName: email.fromName,
      to: email.to,
      subject: email.subject,
      snippet: email.snippet,
    }));
}

function mcpEmailSearchResult(match) {
  return {
    accountEmail: match.account.email,
    provider: match.account.provider,
    emailId: match.email.emailId,
    threadId: match.email.threadId,
    fromEmail: match.email.fromEmail,
    fromName: match.email.fromName,
    to: match.email.to,
    subject: match.email.subject,
    snippet: match.email.snippet,
  };
}

function emailMatchesFrom(email, from) {
  const normalized = String(from || "").toLowerCase();
  return String(email.fromEmail || "").toLowerCase().includes(normalized) || String(email.fromName || "").toLowerCase().includes(normalized);
}

async function searchGmailEmailsForRules(accessToken, { query, fromEmail = "" }, limit) {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  const queryParts = [];
  if (query) {
    queryParts.push(`subject:${quoteGmailSearchValue(query)}`);
  }
  if (fromEmail) {
    queryParts.push(`from:${quoteGmailSearchValue(fromEmail)}`);
  }
  if (queryParts.length) {
    url.searchParams.set("q", queryParts.join(" "));
  }
  url.searchParams.set("maxResults", String(Math.min(Math.max(limit, 1), 10)));

  const response = await providerFetch(url.toString(), accessToken, { method: "GET" });
  const data = await response.json();
  const messages = data.messages ?? [];
  const emails = [];

  for (const item of messages) {
    const message = await fetchGmailMessageFull(accessToken, item.id);
    emails.push(gmailMessageToRuleSearchResult(message, item.id));
  }

  return emails;
}

async function fetchGmailMessageFull(accessToken, emailId) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(emailId)}`);
  url.searchParams.set("format", "full");

  const response = await providerFetch(url.toString(), accessToken, { method: "GET" });
  return response.json();
}

async function fetchGmailMessageFullByAnyId(accessToken, emailId) {
  try {
    return await fetchGmailMessageFull(accessToken, emailId);
  } catch (error) {
    if (error.status !== 404) {
      throw error;
    }
  }

  const message = await searchGmailMessageByRfc822MessageId(accessToken, emailId);
  if (!message) {
    const error = new Error("Gmail message not found");
    error.status = 404;
    throw error;
  }

  return message;
}

async function searchGmailMessageByRfc822MessageId(accessToken, emailId) {
  const normalizedMessageId = normalizeRfc822MessageId(emailId);
  if (!normalizedMessageId) {
    return null;
  }

  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("q", `rfc822msgid:${normalizedMessageId}`);
  url.searchParams.set("maxResults", "10");

  const response = await providerFetch(url.toString(), accessToken, { method: "GET" });
  const data = await response.json();
  const messages = data.messages ?? [];

  for (const item of messages) {
    try {
      const message = await fetchGmailMessageFull(accessToken, item.id);
      const headers = getGmailHeaders(message);
      if (normalizeRfc822MessageId(headers["message-id"]) === normalizedMessageId) {
        return message;
      }
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }
    }
  }

  return messages[0]?.id ? fetchGmailMessageFull(accessToken, messages[0].id) : null;
}

function normalizeRfc822MessageId(value = "") {
  return String(value).trim().replace(/^<|>$/g, "");
}

function gmailMessageToRuleSearchResult(message, fallbackEmailId) {
  const headers = getGmailHeaders(message);
  const fromEmail = extractEmailAddress(headers.from || "");

  return {
    emailId: message.id || fallbackEmailId,
    threadId: message.threadId || message.id || fallbackEmailId,
    fromEmail,
    fromName: extractDisplayName(headers.from || "") || fromEmail,
    to: formatEmailList(headers.to || ""),
    subject: headers.subject || "",
    snippet: extractGmailTextBody(message.payload) || message.snippet || "",
  };
}

async function findConnectedMessageById(userId, emailId, subject) {
  const accounts = await getConnectedEmailAccounts(userId);
  const matches = [];

  for (const account of accounts) {
    if (!["gmail", "imap", "yahoo"].includes(account.provider)) {
      continue;
    }

    try {
      if (account.provider === "gmail") {
        assertGmailAccountHasRequiredScopes(account);
        const accessToken = await getValidEmailAccountAccessToken(account);
        const message = await fetchGmailMessageFullByAnyId(accessToken, emailId);
        const headers = getGmailHeaders(message);
        const bodyText = extractGmailTextBody(message.payload) || message.snippet || "";
        matches.push({
          account,
          subject: getProviderMessageSubject(account.provider, message),
          email: {
            emailId: message.id || emailId,
            threadId: message.threadId || message.id || emailId,
            accountEmail: account.email,
            provider: account.provider,
            fromEmail: extractEmailAddress(headers.from || ""),
            fromName: extractDisplayName(headers.from || "") || extractEmailAddress(headers.from || ""),
            to: formatEmailList(headers.to || ""),
            subject: headers.subject || "",
            snippet: bodyText.slice(0, 300),
            bodyText,
          },
        });
      } else {
        const accessToken = account.provider === "yahoo"
          ? await getValidEmailAccountAccessToken(account)
          : "";
        const match = await findImapMessageAccountMatch(account, emailId, subject, accessToken);
        if (match) {
          const email = await fetchImapEmailContextById(account, emailId, subject, accessToken);
          matches.push({ account, subject: match.subject, email: email ?? { subject: match.subject } });
        }
      }
    } catch (error) {
      if (error.status !== 404) {
        console.warn(`Integration message lookup failed for ${account.provider} ${account.email}:`, error.message);
      }
    }
  }

  if (matches.length === 0) {
    return null;
  }

  if (matches.length === 1) {
    return matches[0];
  }

  const normalizedSubject = normalizeComparableSubject(subject);
  return matches.find((match) => normalizeComparableSubject(match.subject) === normalizedSubject) ?? null;
}

export async function findConnectedEmailContextById(userId, { emailId, accountEmail = "", subject = "" }) {
  const accounts = await getConnectedEmailAccounts(userId);
  const selectedAccounts = accountEmail
    ? accounts.filter((account) => account.email.toLowerCase() === String(accountEmail).trim().toLowerCase())
    : accounts;
  const matches = [];
  const lookupFailures = [];

  if (accountEmail && selectedAccounts.length === 0) {
    const error = new Error("Email account not found");
    error.status = 404;
    throw error;
  }

  for (const account of selectedAccounts) {
    if (!["gmail", "imap", "yahoo"].includes(account.provider)) {
      continue;
    }

    try {
      if (account.provider === "gmail") {
        assertGmailAccountHasRequiredScopes(account);
        const accessToken = await getValidEmailAccountAccessToken(account);
        const message = await fetchGmailMessageFullByAnyId(accessToken, emailId);
        const headers = getGmailHeaders(message);
        const bodyText = extractGmailTextBody(message.payload) || message.snippet || "";
        matches.push({
          account,
          email: {
            emailId: message.id || emailId,
            threadId: message.threadId || message.id || emailId,
            accountEmail: account.email,
            provider: account.provider,
            fromEmail: extractEmailAddress(headers.from || ""),
            fromName: extractDisplayName(headers.from || "") || extractEmailAddress(headers.from || ""),
            to: formatEmailList(headers.to || ""),
            subject: headers.subject || "",
            snippet: bodyText.slice(0, 300),
            bodyText,
          },
        });
      } else {
        const accessToken = account.provider === "yahoo"
          ? await getValidEmailAccountAccessToken(account)
          : "";
        const email = await fetchImapEmailContextById(account, emailId, subject, accessToken);
        if (email) {
          matches.push({ account, email });
        }
      }
    } catch (error) {
      lookupFailures.push({
        provider: account.provider,
        email: account.email,
        status: error.status ?? null,
        error: summarizeProviderLookupError(error),
      });
      if (error.status !== 404) {
        console.warn(`Integration full message lookup failed for ${account.provider} ${account.email}:`, error.message);
      }
    }
  }

  if (matches.length === 0) {
    const error = new Error("Email was not found in connected email accounts.");
    error.status = 404;
    error.lookupFailures = lookupFailures;
    throw error;
  }

  if (matches.length === 1 || !subject) {
    return matches[0];
  }

  const normalizedSubject = normalizeComparableSubject(subject);
  return matches.find((match) => normalizeComparableSubject(match.email.subject) === normalizedSubject) ?? matches[0];
}

function summarizeProviderLookupError(error) {
  if (error.message === "missing_gmail_modify_scope") {
    return "missing_gmail_modify_scope";
  }

  if (error.status === 404) {
    return "not_found";
  }

  if (error.status === 401 || error.status === 403) {
    return "account_auth_failed";
  }

  if (String(error.message || "").toLowerCase().includes("token refresh failed")) {
    return "account_token_refresh_failed";
  }

  return error.message || "lookup_failed";
}

function assertGmailAccountHasRequiredScopes(account) {
  const scopes = Array.isArray(account.scopes) ? account.scopes : [];
  if (!scopes.includes(GMAIL_MODIFY_SCOPE)) {
    const error = new Error("missing_gmail_modify_scope");
    error.status = 403;
    throw error;
  }
}

async function requireSession(req, res, next) {
  const user = await resolveRequestUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  req.user = user;
  next();
}

export async function requireApiKey(req, res, next) {
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
    return { ok: false, error: "labels must include exactly one label name" };
  }

  const uniqueLabels = [...new Set(labels)];
  if (uniqueLabels.length !== 1) {
    return { ok: false, error: "labels must include exactly one label name" };
  }

  return { ok: true, accountEmail, emailId, labels: uniqueLabels };
}

function parseLabelReasons(value, { allowEmpty = false } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "labelReasons must be an object keyed by label name" };
  }

  const labelReasons = {};

  for (const [label, reason] of Object.entries(value)) {
    const labelName = typeof label === "string" ? label.trim() : "";
    const reasonText = typeof reason === "string" ? reason.trim() : "";

    if (!labelName) {
      return { ok: false, error: "labelReasons cannot include an empty label name" };
    }

    if (!allowEmpty && !reasonText) {
      return { ok: false, error: `Reason is required for ${labelName}` };
    }

    if (reasonText.length > 200) {
      return { ok: false, error: `Reason for ${labelName} must be 200 characters or less` };
    }

    labelReasons[labelName] = reasonText;
  }

  return { ok: true, labelReasons };
}

async function parseManualRuleReviewInput(userId, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Request body must be an object" };
  }

  const rule = {};
  const stringFields = ["emailId", "threadId", "fromEmail", "fromName", "subject", "snippet"];

  for (const field of stringFields) {
    if (typeof body[field] !== "string" || body[field].trim().length === 0) {
      return { ok: false, error: `${field} must be a non-empty string` };
    }

    rule[field] = body[field].trim();
  }

  const labelsApplied = Array.isArray(body.labelsApplied)
    ? body.labelsApplied.filter((label) => typeof label === "string").map((label) => label.trim()).filter(Boolean)
    : [];
  const uniqueLabelsApplied = [...new Set(labelsApplied)];

  if (uniqueLabelsApplied.length !== 1) {
    return { ok: false, error: "Select exactly one label before marking the rule reviewed" };
  }

  const resolvedLabels = await resolveAppLabelsByName(userId, uniqueLabelsApplied);
  if (!resolvedLabels.ok) {
    return resolvedLabels;
  }

  const labelReasonsInput = parseLabelReasons(body.labelReasons ?? {}, { allowEmpty: true });
  if (!labelReasonsInput.ok) {
    return labelReasonsInput;
  }

  const unexpectedReasons = Object.keys(labelReasonsInput.labelReasons).filter(
    (label) => !resolvedLabels.labels.some((selectedLabel) => selectedLabel.toLowerCase() === label.toLowerCase()),
  );
  if (unexpectedReasons.length > 0) {
    return { ok: false, error: "labelReasons can only include labels listed in labelsApplied", labels: unexpectedReasons };
  }

  return {
    ok: true,
    rule: {
      ...rule,
      confidence: 1,
      labelsApplied: resolvedLabels.labels,
      isPending: false,
      metadata: {
        labelReasons: normalizeLabelReasons(resolvedLabels.labels, labelReasonsInput.labelReasons),
      },
    },
  };
}

function normalizeLabelReasons(labels, labelReasons) {
  const normalizedReasons = {};

  for (const label of labels) {
    const entry = Object.entries(labelReasons).find(([reasonLabel]) => reasonLabel.toLowerCase() === label.toLowerCase());
    normalizedReasons[label] = typeof entry?.[1] === "string" ? entry[1].trim() : "";
  }

  return normalizedReasons;
}

export function parseDraftInput(body) {
  const accountEmail = typeof body?.accountEmail === "string" ? body.accountEmail.trim().toLowerCase() : "";
  const emailId = typeof body?.emailId === "string" ? body.emailId.trim() : "";
  const to = typeof body?.to === "string" ? body.to.trim() : "";
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
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

  return { ok: true, accountEmail, emailId, to, subject, bodyText, bodyHtml, replyAll };
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

export async function parseEmailRuleInput(userId, body, { partial }) {
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

    const uniqueLabelInputs = [...new Map(body.labelsApplied.map((label) => [label.trim().toLowerCase(), label.trim()])).values()].filter(Boolean);

    if (uniqueLabelInputs.length === 0) {
      return { ok: false, error: "labelsApplied must include at least one label" };
    }

    if (uniqueLabelInputs.length > 3) {
      return { ok: false, error: "labelsApplied can include at most 3 labels" };
    }

    const labels = await resolveAppLabelsByName(userId, uniqueLabelInputs);
    if (!labels.ok) {
      return labels;
    }

    rule.labelsApplied = labels.labels;
  }

  if ("labelReasons" in body) {
    const labelReasons = parseLabelReasons(body.labelReasons);
    if (!labelReasons.ok) {
      return labelReasons;
    }

    const selectedLabels = rule.labelsApplied ?? [];
    const unexpectedReasons = Object.keys(labelReasons.labelReasons).filter(
      (label) => !selectedLabels.some((selectedLabel) => selectedLabel.toLowerCase() === label.toLowerCase()),
    );
    if (unexpectedReasons.length > 0) {
      return { ok: false, error: "labelReasons can only include labels listed in labelsApplied", labels: unexpectedReasons };
    }

    rule.metadata = {
      ...(rule.metadata ?? {}),
      labelReasons: normalizeLabelReasons(selectedLabels, labelReasons.labelReasons),
    };
  }

  if ("labelsApplied" in body && rule.labelsApplied?.length > 0) {
    const labelReasons = rule.metadata?.labelReasons ?? {};
    const missingReasons = rule.labelsApplied.filter(
      (label) => !Object.entries(labelReasons).some(([reasonLabel, reason]) => reasonLabel.toLowerCase() === label.toLowerCase() && reason),
    );
    if (missingReasons.length > 0) {
      return { ok: false, error: "A reason is required for each label in labelsApplied", labels: missingReasons };
    }
  }

  if ("isPending" in body) {
    if (typeof body.isPending !== "boolean") {
      return { ok: false, error: "isPending must be a boolean" };
    }

    rule.isPending = body.isPending;
  } else if (!partial) {
    rule.isPending = true;
  }

  if ("accountEmail" in body) {
    if (typeof body.accountEmail !== "string" || body.accountEmail.trim().length === 0) {
      return { ok: false, error: "accountEmail must be a non-empty string" };
    }

    rule.metadata = {
      ...(rule.metadata ?? {}),
      accountEmail: body.accountEmail.trim().toLowerCase(),
    };
  }

  if (partial && Object.keys(rule).length === 0) {
    return { ok: false, error: "At least one email rule field is required" };
  }

  return { ok: true, rule };
}

export async function parseLabelClassificationInput(userId, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Request body must be an object" };
  }

  for (const field of EMAIL_RULE_REQUIRED_FIELDS) {
    if (!(field in body)) {
      return { ok: false, error: `${field} is required` };
    }
  }

  const rule = {};
  const stringFields = ["emailId", "threadId", "fromEmail", "fromName", "subject", "snippet"];

  for (const field of stringFields) {
    if (typeof body[field] !== "string" || body[field].trim().length === 0) {
      return { ok: false, error: `${field} must be a non-empty string` };
    }

    rule[field] = body[field].trim();
  }

  if (!Array.isArray(body.labelsApplied)) {
    return { ok: false, error: "labelsApplied must be an array of label candidate objects" };
  }

  if (body.labelsApplied.length > 3) {
    return { ok: false, error: "labelsApplied can include at most 3 label candidates" };
  }

  const parsedCandidates = [];

  for (const [index, candidate] of body.labelsApplied.entries()) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return { ok: false, error: `labelsApplied[${index}] must be an object` };
    }

    const labelName = typeof candidate.labelName === "string" ? candidate.labelName.trim() : "";
    const confidence = Number(candidate.confidence);
    const reason = typeof candidate.reason === "string" ? candidate.reason.trim() : "";

    if (!labelName) {
      return { ok: false, error: `labelsApplied[${index}].labelName must be a non-empty string` };
    }

    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      return { ok: false, error: `labelsApplied[${index}].confidence must be a number between 0 and 1` };
    }

    if (!reason) {
      return { ok: false, error: `labelsApplied[${index}].reason is required` };
    }

    if (reason.length > 200) {
      return { ok: false, error: `labelsApplied[${index}].reason must be 200 characters or less` };
    }

    parsedCandidates.push({ labelName, confidence, reason });
  }

  const uniqueCandidates = [];
  const candidatesByLowerName = new Map();

  for (const candidate of parsedCandidates) {
    const lowerName = candidate.labelName.toLowerCase();
    const existing = candidatesByLowerName.get(lowerName);

    if (!existing || candidate.confidence > existing.confidence) {
      candidatesByLowerName.set(lowerName, candidate);
    }
  }

  uniqueCandidates.push(...candidatesByLowerName.values());

  const labels = await resolveAppLabelsByName(userId, uniqueCandidates.map((candidate) => candidate.labelName));
  if (!labels.ok) {
    return labels;
  }

  const canonicalLabelsByLowerName = new Map(labels.labels.map((label) => [label.toLowerCase(), label]));
  rule.labelCandidates = uniqueCandidates.map((candidate) => ({
    ...candidate,
    labelName: canonicalLabelsByLowerName.get(candidate.labelName.toLowerCase()) ?? candidate.labelName,
  }));

  if ("accountEmail" in body) {
    if (typeof body.accountEmail !== "string" || body.accountEmail.trim().length === 0) {
      return { ok: false, error: "accountEmail must be a non-empty string" };
    }

    rule.metadata = {
      accountEmail: body.accountEmail.trim().toLowerCase(),
    };
  }

  return { ok: true, rule };
}

function addRuleSearchConditions(search, conditions, values) {
  const terms = search.split(/\s+/).map((term) => term.trim()).filter(Boolean).slice(0, 8);

  for (const term of terms) {
    values.push(`%${escapeLike(term)}%`);
    conditions.push(`(
      from_email ilike $${values.length} escape '\\'
      or from_name ilike $${values.length} escape '\\'
      or subject ilike $${values.length} escape '\\'
      or snippet ilike $${values.length} escape '\\'
      or array_to_string(labels_applied, ' ') ilike $${values.length} escape '\\'
      or metadata::text ilike $${values.length} escape '\\'
    )`);
  }
}

export async function upsertEmailRule(userId, rule) {
  const ruleToSave = await resolveRuleAccountEmailForSave(userId, rule);
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
      ruleToSave.emailId,
      ruleToSave.threadId,
      ruleToSave.fromEmail,
      ruleToSave.fromName,
      ruleToSave.subject,
      ruleToSave.snippet,
      ruleToSave.confidence,
      ruleToSave.labelsApplied,
      ruleToSave.isPending,
      JSON.stringify(ruleToSave.metadata ?? {}),
    ],
  );

  return mapEmailRuleRow(result.rows[0]);
}

async function emitEmailRuleUpsertWebhook(userId, previousRule, rule, payload) {
  const eventName = previousRule ? "email_rule.modified" : "email_rule.created";
  await emitWebhookEvent(userId, eventName, {
    rule,
    payload,
    previous: previousRule,
  });
}

async function resolveRuleAccountEmailForSave(userId, rule) {
  if (rule.metadata?.accountEmail || !rule.emailId) {
    return rule;
  }

  const target = await findConnectedMessageById(userId, rule.emailId, rule.subject);
  if (!target?.account?.email) {
    return rule;
  }

  return {
    ...rule,
    metadata: {
      ...(rule.metadata ?? {}),
      accountEmail: target.account.email,
    },
  };
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

async function getEmailRuleByEmailId(userId, emailId) {
  const result = await dbPool.query(
    `
      select ${EMAIL_RULE_SELECT}
      from email_rules
      where user_id = $1 and email_id = $2
      limit 1
    `,
    [userId, emailId],
  );

  return result.rows[0] ? mapEmailRuleRow(result.rows[0]) : null;
}

async function getRecentRules(userId, limit) {
  const result = await dbPool.query(
    `
      select ${EMAIL_RULE_SELECT}
      from email_rules
      where user_id = $1
      order by updated_at desc
      limit $2
    `,
    [userId, limit],
  );

  return hydrateRuleAccountEmails(userId, result.rows.map(mapEmailRuleRow));
}

async function hydrateRuleAccountEmails(userId, rules) {
  const hydratedRules = [];

  for (const rule of rules) {
    if (rule.accountEmail) {
      hydratedRules.push(rule);
      continue;
    }

    const target = await findConnectedMessageById(userId, rule.emailId, rule.subject);
    if (!target?.account?.email) {
      hydratedRules.push(rule);
      continue;
    }

    await dbPool.query(
      `
        update email_rules
        set metadata = metadata || jsonb_build_object('accountEmail', $3::text)
        where user_id = $1 and email_id = $2
      `,
      [userId, rule.emailId, target.account.email],
    );

    hydratedRules.push({
      ...rule,
      accountEmail: target.account.email,
    });
  }

  return hydratedRules;
}

async function getRuleStatusCounts(userId) {
  const result = await dbPool.query(
    `
      select
        count(*) filter (where is_pending = true)::int as pending,
        count(*) filter (where is_pending = false)::int as "nonPending"
      from email_rules
      where user_id = $1
    `,
    [userId],
  );

  return {
    pending: result.rows[0]?.pending ?? 0,
    nonPending: result.rows[0]?.nonPending ?? 0,
  };
}

async function getSyncedLabelCount(userId) {
  const result = await dbPool.query(
    `
      with account_count as (
        select count(*)::int as total
        from email_accounts
        where user_id = $1
      )
      select count(*)::int as count
      from labels l
      cross join account_count ac
      where l.user_id = $1
        and l.system_key is null
        and ac.total > 0
        and (
          select count(distinct las.email_account_id)::int
          from label_account_syncs las
          where las.label_id = l.id
            and las.sync_status = 'synced'
            and las.provider_label_id is not null
        ) >= ac.total
    `,
    [userId],
  );

  return result.rows[0]?.count ?? 0;
}

async function getConnectedEmailAccountCount(userId) {
  const accounts = await getConnectedEmailAccounts(userId);
  return accounts.length;
}

async function getMetricEventCountForToday(userId, eventType) {
  const result = await dbPool.query(
    `
      select count(*)::int as count
      from integration_metric_events
      where user_id = $1
        and event_type = $2
        and created_at >= date_trunc('day', now())
    `,
    [userId, eventType],
  );

  return result.rows[0]?.count ?? 0;
}

async function getRulesCreatedTimeline(userId) {
  const result = await dbPool.query(
    `
      with days as (
        select generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') as day
      )
      select to_char(days.day, 'YYYY-MM-DD') as date,
             count(email_rules.id)::int as value
      from days
      left join email_rules
        on email_rules.user_id = $1
       and date_trunc('day', email_rules.created_at) = days.day
      group by days.day
      order by days.day
    `,
    [userId],
  );

  return result.rows;
}

async function getMetricEventTimeline(userId, eventType) {
  const result = await dbPool.query(
    `
      with days as (
        select generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') as day
      )
      select to_char(days.day, 'YYYY-MM-DD') as date,
             count(integration_metric_events.id)::int as value
      from days
      left join integration_metric_events
        on integration_metric_events.user_id = $1
       and integration_metric_events.event_type = $2
       and date_trunc('day', integration_metric_events.created_at) = days.day
      group by days.day
      order by days.day
    `,
    [userId, eventType],
  );

  return result.rows;
}

export async function recordMetricEvent(userId, eventType, { emailId = null, accountEmail = null, metadata = {} } = {}) {
  await dbPool.query(
    `
      insert into integration_metric_events (id, user_id, event_type, email_id, account_email, metadata)
      values ($1, $2, $3, $4, $5, $6)
    `,
    [crypto.randomUUID(), userId, eventType, emailId, accountEmail, JSON.stringify(metadata)],
  );
}

export function buildEmailRuleQuery(query, parameterOffset = 2) {
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

export function parseQueryLimit(value) {
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

export function mapEmailRuleRow(row) {
  const {
    reason: _reason,
    userQuestion: _userQuestion,
    ruleSuggestion: _ruleSuggestion,
    recommendedAction: _recommendedAction,
    ...metadata
  } = row.metadata ?? {};

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
    ...metadata,
    accountEmail: metadata.accountEmail ?? null,
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

export async function getUserEmailAccount(userId, accountEmail) {
  await ensureSsoEmailAccount(userId);

  const result = await dbPool.query(
    `
      select id, provider, email, access_token, refresh_token, token_expires_at as "tokenExpiresAt", metadata
      from email_accounts
      where user_id = $1 and lower(email) = lower($2)
      limit 1
    `,
    [userId, accountEmail],
  );

  return result.rows[0] ?? null;
}

export async function resolveProviderLabels(userId, emailAccountId, labelNames) {
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

async function resolveOtherSyncedProviderLabels(userId, emailAccountId, selectedLabelName) {
  const result = await dbPool.query(
    `
      select min(l.name) as name,
             lower(min(l.name)) as "sortName",
             las.provider_label_id as "providerLabelId"
      from labels l
      join label_account_syncs las on las.label_id = l.id and las.email_account_id = $2
      where l.user_id = $1
        and lower(l.name) <> lower($3)
        and las.sync_status = 'synced'
        and las.provider_label_id is not null
      group by las.provider_label_id
      order by "sortName"
    `,
    [userId, emailAccountId, selectedLabelName],
  );

  const byProviderId = new Map();
  for (const row of result.rows) {
    byProviderId.set(row.providerLabelId, {
      name: row.name,
      providerLabelId: row.providerLabelId,
    });
  }
  return [...byProviderId.values()];
}

export async function modifyGmailMessageLabels({ accessToken, emailId, addLabelIds, removeLabelIds }) {
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

export async function createProviderReplyDraft({ accessToken, account, input }) {
  if (!String(input?.bodyText || "").trim() && !String(input?.bodyHtml || "").trim()) {
    const error = new Error("Draft body cannot be empty");
    error.status = 400;
    throw error;
  }

  if (account.provider === "gmail") {
    return createGmailReplyDraft({ accessToken, account, input });
  }

  if (account.provider === "imap") {
    return createImapDraft({ account, input });
  }

  throw new Error(`${account.provider} draft replies are not implemented yet`);
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

export function buildDraftWebhookPayload({ account, input, draft }) {
  return {
    to: extractDraftRecipients(draft),
    from: account.email,
    subject: draft?.message?.subject ?? draft?.subject ?? null,
    body: {
      text: input.bodyText,
      html: input.bodyHtml,
    },
    accountEmail: account.email,
    emailId: input.emailId,
    draftId: draft?.id ?? null,
    provider: account.provider,
  };
}

function extractDraftRecipients(draft) {
  if (Array.isArray(draft?.toRecipients)) {
    return draft.toRecipients
      .map((recipient) => recipient.emailAddress?.address ?? recipient.emailAddress?.name)
      .filter(Boolean);
  }

  if (draft?.message?.to) {
    return draft.message.to;
  }

  return [];
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

function getProviderMessageSubject(provider, message) {
  if (provider === "gmail") {
    return getGmailHeaders(message).subject ?? "";
  }

  return "";
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

function extractDisplayName(value = "") {
  const match = String(value).match(/^"?([^"<]+)"?\s*</);
  return (match?.[1] ?? "").trim();
}

function formatEmailList(value = "") {
  return String(value)
    .split(",")
    .map((item) => extractEmailAddress(item))
    .filter(Boolean)
    .join(", ");
}

function quoteGmailSearchValue(value) {
  const escaped = String(value).trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function extractGmailTextBody(part) {
  if (!part) {
    return "";
  }

  if (part.mimeType === "text/plain" && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }

  for (const childPart of part.parts ?? []) {
    const body = extractGmailTextBody(childPart);
    if (body) {
      return body;
    }
  }

  if (part.body?.data) {
    return stripHtml(decodeBase64Url(part.body.data));
  }

  return "";
}

function decodeBase64Url(value) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function stripHtml(value) {
  return String(value)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeReplySubject(subject) {
  return /^re:/i.test(subject) ? subject : `Re: ${subject || "(no subject)"}`;
}

function normalizeComparableSubject(subject) {
  return String(subject ?? "").trim().replace(/\s+/g, " ").toLowerCase();
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
    const error = new Error(`Provider request failed with ${response.status}: ${text.slice(0, 300)}`);
    error.status = response.status;
    throw error;
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
