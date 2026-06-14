import crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod/v4";
import { auth } from "./auth.js";
import { dbPool } from "./db.js";
import { getValidEmailAccountAccessToken } from "./email-accounts.js";
import {
  buildDraftWebhookPayload,
  buildEmailRuleQuery,
  classifyEmailWithLabelCandidates,
  createProviderReplyDraft,
  EMAIL_RULE_SELECT,
  getUserEmailAccount,
  mapEmailRuleRow,
  parseDraftInput,
  parseLabelClassificationInput,
  parseQueryLimit,
  recordMetricEvent,
} from "./integrations.js";
import { emitWebhookEvent } from "./webhooks.js";
import { logSystemEvent } from "./system-logs.js";

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
      return loggedMcpToolResult(userId, "create_draft_reply", input, "/api/integrations/email/drafts/reply", () => createDraftReplyTool(userId, input));
    },
  );

  server.registerTool(
    "add_labels_on_email",
    {
      title: "Add Labels On Email",
      description:
        "Classify an email with label candidates. Applies the uniquely highest-confidence label when it meets the current threshold; otherwise creates a pending email rule.",
      inputSchema: {
        emailId: z.string().min(1),
        threadId: z.string().min(1),
        fromEmail: z.string().min(1),
        fromName: z.string().min(1),
        subject: z.string().min(1),
        snippet: z.string().min(1),
        labelsApplied: z.array(z.object({
          labelName: z.string().min(1),
          confidence: z.number().min(0).max(1),
          reason: z.string().min(1).max(200),
        })).max(3),
      },
    },
    async (input) => {
      return loggedMcpToolResult(userId, "add_labels_on_email", input, "/api/integrations/email/labels/add", () => addLabelsOnEmailTool(userId, input));
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
      return loggedMcpToolResult(userId, "query_email_rules", input, "/api/integrations/email-rules/query", () => queryEmailRulesTool(userId, input));
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
  const input = await parseLabelClassificationInput(userId, payload);
  if (!input.ok) {
    throw new Error(input.error);
  }

  return classifyEmailWithLabelCandidates(userId, input.rule, { source: "mcp" });
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

async function loggedMcpToolResult(userId, toolName, payload, internalEndpoint, fn) {
  try {
    const result = await fn();
    await logSystemEvent(userId, {
      category: "mcp-server",
      eventName: toolName,
      status: "success",
      message: `${toolName} triggered ${internalEndpoint}.`,
      payload: { toolPayload: payload, internalEndpoint, result },
    });
    return jsonToolResult(result);
  } catch (error) {
    await logSystemEvent(userId, {
      category: "mcp-server",
      eventName: toolName,
      status: "error",
      message: `${toolName} failed while triggering ${internalEndpoint}: ${error.message}`,
      payload: { toolPayload: payload, internalEndpoint, error: error.message },
    });
    throw error;
  }
}

function handleHttpError(res, error) {
  console.error("MCP API failed:", error);
  res.status(500).json({ error: "MCP request failed" });
}
