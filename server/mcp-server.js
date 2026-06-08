import crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod/v4";
import { auth } from "./auth.js";
import { dbPool } from "./db.js";
import { getConnectedEmailAccounts, getValidEmailAccountAccessToken } from "./email-accounts.js";
import { findImapMessageAccountMatch, moveImapMessageToFolders } from "./imap-provider.js";
import {
  buildDraftWebhookPayload,
  buildEmailRuleQuery,
  createProviderReplyDraft,
  EMAIL_RULE_SELECT,
  getUserEmailAccount,
  mapEmailRuleRow,
  modifyGmailMessageLabels,
  parseDraftInput,
  parseEmailRuleInput,
  parseQueryLimit,
  recordMetricEvent,
  resolveProviderLabels,
  upsertEmailRule,
  withSystemDefaultLabel,
} from "./integrations.js";
import { ensureSystemDefaultLabel } from "./labels.js";
import { getConfidenceThreshold } from "./settings.js";
import { emitWebhookEvent } from "./webhooks.js";

const MCP_KEY_PREFIX = "mcp";

export async function ensureMcpTables() {
  if (!dbPool) {
    return;
  }

  await dbPool.query(`
    create table if not exists mcp_api_keys (
      id uuid primary key,
      user_id text not null references "user"(id) on delete cascade,
      name text not null,
      key_hash text not null unique,
      key_prefix text not null,
      last_used_at timestamptz,
      created_at timestamptz not null default now()
    )
  `);
  await dbPool.query("create index if not exists mcp_api_keys_user_id_idx on mcp_api_keys(user_id)");
}

export function registerMcpRoutes(app) {
  app.get("/api/mcp-api-keys", requireSession, async (req, res) => {
    try {
      const result = await dbPool.query(
        `
          select id, name, key_prefix as "keyPrefix", last_used_at as "lastUsedAt", created_at as "createdAt"
          from mcp_api_keys
          where user_id = $1
          order by created_at desc
        `,
        [req.user.id],
      );

      res.json({ keys: result.rows });
    } catch (error) {
      handleHttpError(res, error);
    }
  });

  app.post("/api/mcp-api-keys", requireSession, async (req, res) => {
    const name = typeof req.body?.name === "string" && req.body.name.trim() ? req.body.name.trim() : "MCP client";
    const token = createMcpApiKey();
    const keyPrefix = token.slice(0, 12);

    try {
      const result = await dbPool.query(
        `
          insert into mcp_api_keys (id, user_id, name, key_hash, key_prefix)
          values ($1, $2, $3, $4, $5)
          returning id, name, key_prefix as "keyPrefix", created_at as "createdAt"
        `,
        [crypto.randomUUID(), req.user.id, name.slice(0, 60), hashApiKey(token), keyPrefix],
      );

      res.status(201).json({ key: result.rows[0], token });
    } catch (error) {
      handleHttpError(res, error);
    }
  });

  app.delete("/api/mcp-api-keys/:id", requireSession, async (req, res) => {
    try {
      const result = await dbPool.query("delete from mcp_api_keys where user_id = $1 and id = $2", [
        req.user.id,
        req.params.id,
      ]);

      res.json({ deleted: result.rowCount });
    } catch (error) {
      handleHttpError(res, error);
    }
  });

  app.post("/mcp", async (req, res) => {
    const authResult = await authenticateMcpRequest(req);
    if (!authResult.ok) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: authResult.error },
        id: null,
      });
      return;
    }

    const server = createMcpServer(authResult.userId);

    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
    } catch (error) {
      console.error("MCP request failed:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", (_req, res) => {
    res.status(405).set("Allow", "POST").send("Method Not Allowed");
  });

  app.delete("/mcp", (_req, res) => {
    res.status(405).set("Allow", "POST").send("Method Not Allowed");
  });
}

function createMcpServer(userId) {
  const server = new McpServer({
    name: "emailable",
    version: "1.0.0",
  });

  server.registerTool(
    "create_draft_reply",
    {
      title: "Create Draft Reply",
      description: "Create a draft reply in the connected account that owns the message, using the same behavior as the REST Create Draft Reply API.",
      inputSchema: {
        accountEmail: z.string().email().describe("Connected email account that owns the message."),
        emailId: z.string().min(1).describe("Provider email/message id to reply to."),
        bodyText: z.string().optional().describe("Plain text body for the draft reply."),
        bodyHtml: z.string().optional().describe("HTML body for the draft reply."),
        replyAll: z.boolean().optional().describe("Whether to reply all instead of replying only to the sender."),
      },
    },
    async (input) => {
      const result = await createDraftReplyTool(userId, input);
      return jsonToolResult(result);
    },
  );

  server.registerTool(
    "add_labels_on_email",
    {
      title: "Add Labels On Email",
      description:
        "Apply labels when confidence meets the current threshold. Otherwise apply only the system label and create a pending email rule.",
      inputSchema: {
        emailId: z.string().min(1),
        threadId: z.string().min(1),
        fromEmail: z.string().min(1),
        fromName: z.string().min(1),
        subject: z.string().min(1),
        snippet: z.string().min(1),
        confidence: z.number(),
        labelsApplied: z.array(z.string().min(1)),
      },
    },
    async (input) => {
      const result = await addLabelsOnEmailTool(userId, input);
      return jsonToolResult(result);
    },
  );

  server.registerTool(
    "query_email_rules",
    {
      title: "Query Email Rules",
      description: "Query email rules using the same AND/OR and equivalence behavior as the REST Query Email Rules API.",
      inputSchema: {
        query: z.record(z.string(), z.unknown()).describe("Query tree using operator/conditions or field/equivalence/value."),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async (input) => {
      const result = await queryEmailRulesTool(userId, input);
      return jsonToolResult(result);
    },
  );

  return server;
}

async function createDraftReplyTool(userId, payload) {
  const input = parseDraftInput(payload);
  if (!input.ok) {
    throw new Error(input.error);
  }

  const account = await getUserEmailAccount(userId, input.accountEmail);
  if (!account) {
    throw new Error("Email account not found for this MCP key");
  }

  const accessToken = await getValidEmailAccountAccessToken(account);
  const draft = await createProviderReplyDraft({ accessToken, account, input });
  await recordMetricEvent(userId, "draft_created", {
    emailId: input.emailId,
    accountEmail: account.email,
    metadata: { provider: account.provider, draftId: draft.id, source: "mcp" },
  });
  await emitWebhookEvent(userId, "email.drafted", buildDraftWebhookPayload({ account, input, draft }));

  return {
    accountEmail: account.email,
    emailId: input.emailId,
    draftId: draft.id,
    messageId: draft.message?.id ?? draft.id ?? null,
    threadId: draft.message?.threadId ?? draft.conversationId ?? null,
  };
}

async function addLabelsOnEmailTool(userId, payload) {
  const input = await parseEmailRuleInput(userId, payload, { partial: false });
  if (!input.ok) {
    throw new Error(input.error);
  }

  const threshold = await getConfidenceThreshold(userId);
  const target = await findConnectedMessageById(userId, input.rule.emailId, input.rule.subject);
  if (!target) {
    throw new Error("Email was not found in connected Gmail accounts");
  }

  const shouldAutoLabel = input.rule.confidence >= threshold;
  const requestedLabels = shouldAutoLabel ? await withSystemDefaultLabel(userId, input.rule.labelsApplied) : [await getSystemLabelName(userId)];
  const labels = await resolveProviderLabels(userId, target.account.id, requestedLabels);
  if (!labels.ok) {
    const error = new Error(labels.error);
    error.details = labels.labels;
    throw error;
  }

  if (target.account.provider === "gmail") {
    const accessToken = await getValidEmailAccountAccessToken(target.account);
    await modifyGmailMessageLabels({
      accessToken,
      emailId: input.rule.emailId,
      addLabelIds: labels.labels.map((label) => label.providerLabelId),
      removeLabelIds: [],
    });
  } else if (target.account.provider === "imap") {
    await moveImapMessageToFolders({
      account: target.account,
      emailId: input.rule.emailId,
      addFolders: labels.labels.map((label) => label.providerLabelId),
      removeFolders: [],
    });
  } else {
    throw new Error(`${target.account.provider} message labels are not implemented yet`);
  }

  await recordMetricEvent(userId, "email_labeled", {
    emailId: input.rule.emailId,
    accountEmail: target.account.email,
    metadata: {
      provider: target.account.provider,
      labels: labels.labels.map((label) => label.name),
      source: "mcp",
    },
  });
  await emitWebhookEvent(userId, "email.labels_updated", {
    emailId: input.rule.emailId,
    accountEmail: target.account.email,
    added: labels.labels.map((label) => label.name),
    removed: [],
    labels: labels.labels,
    source: "mcp",
  });

  if (shouldAutoLabel) {
    return {
      action: "labels_added",
      threshold,
      confidence: input.rule.confidence,
      accountEmail: target.account.email,
      emailId: input.rule.emailId,
      added: labels.labels,
    };
  }

  const previousRule = await getMcpEmailRuleByEmailId(userId, input.rule.emailId);
  const rule = await upsertEmailRule(userId, {
    ...input.rule,
    isPending: true,
    metadata: {
      source: "mcp",
      threshold,
      systemLabelApplied: true,
      accountEmail: target.account.email,
    },
  });
  await emitWebhookEvent(userId, previousRule ? "email_rule.modified" : "email_rule.created", {
    rule,
    payload: input.rule,
    previous: previousRule,
  });

  return {
    action: "pending_rule_created",
    threshold,
    confidence: input.rule.confidence,
    accountEmail: target.account.email,
    emailId: input.rule.emailId,
    added: labels.labels,
    rule,
  };
}

async function queryEmailRulesTool(userId, payload) {
  const query = buildEmailRuleQuery(payload?.query ?? payload, 2);
  if (!query.ok) {
    throw new Error(query.error);
  }

  const result = await dbPool.query(
    `
      select ${EMAIL_RULE_SELECT}
      from email_rules
      where user_id = $1 and (${query.sql})
      order by created_at desc
      limit $${query.values.length + 2}
    `,
    [userId, ...query.values, parseQueryLimit(payload?.limit)],
  );

  return { rules: result.rows.map(mapEmailRuleRow) };
}

async function getMcpEmailRuleByEmailId(userId, emailId) {
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

async function findConnectedMessageById(userId, emailId, subject) {
  const accounts = await getConnectedEmailAccounts(userId);
  const matches = [];

  for (const account of accounts) {
    if (!["gmail", "imap"].includes(account.provider)) {
      continue;
    }

    try {
      if (account.provider === "gmail") {
        const accessToken = await getValidEmailAccountAccessToken(account);
        const message = await fetchGmailMessageMetadata(accessToken, emailId);
        matches.push({ account, message, subject: getHeaderValue(message, "subject") });
      } else {
        const match = await findImapMessageAccountMatch(account, emailId, subject);
        if (match) {
          matches.push({ account, message: match.message, subject: match.subject });
        }
      }
    } catch (error) {
      if (error.status !== 404) {
        console.warn(`MCP message lookup failed for ${account.provider} ${account.email}:`, error.message);
      }
    }
  }

  if (matches.length === 0) {
    return null;
  }

  if (matches.length === 1) {
    return matches[0];
  }

  const normalizedSubject = normalizeSubject(subject);
  return matches.find((match) => normalizeSubject(match.subject) === normalizedSubject) ?? null;
}

async function fetchGmailMessageMetadata(accessToken, emailId) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(emailId)}`);
  url.searchParams.set("format", "metadata");
  url.searchParams.set("metadataHeaders", "Subject");

  const response = await providerFetch(url.toString(), accessToken, { method: "GET" });
  return response.json();
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

function getHeaderValue(message, headerName) {
  const header = (message.payload?.headers ?? []).find((item) => item.name?.toLowerCase() === headerName.toLowerCase());
  return header?.value ?? "";
}

function normalizeSubject(subject) {
  return String(subject ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

async function getSystemLabelName(userId) {
  const label = await ensureSystemDefaultLabel(userId);
  return label.name;
}

async function authenticateMcpRequest(req) {
  const authorization = req.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    return { ok: false, error: "Provide an MCP API key with Authorization: Bearer <token>" };
  }

  const result = await dbPool.query(
    `
      update mcp_api_keys
      set last_used_at = now()
      where key_hash = $1
      returning user_id as "userId"
    `,
    [hashApiKey(token)],
  );

  const userId = result.rows[0]?.userId;
  if (!userId) {
    return { ok: false, error: "Invalid MCP API key" };
  }

  return { ok: true, userId };
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

function createMcpApiKey() {
  return `${MCP_KEY_PREFIX}_${crypto.randomBytes(32).toString("base64url")}`;
}

function hashApiKey(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function jsonToolResult(result) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

function handleHttpError(res, error) {
  console.error("MCP API failed:", error);
  res.status(500).json({ error: "MCP request failed" });
}
