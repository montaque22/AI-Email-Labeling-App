import crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod/v4";
import { resolveRequestUser } from "./session.js";
import { dbPool } from "./db.js";
import { getValidEmailAccountAccessToken } from "./email-accounts.js";
import {
  buildDraftWebhookPayload,
  buildEmailRuleQuery,
  classifyEmailWithLabelCandidates,
  createProviderReplyDraft,
  EMAIL_RULE_SELECT,
  findConnectedEmailsForMcp,
  getUserEmailAccount,
  mapEmailRuleRow,
  parseDraftInput,
  parseLabelClassificationInput,
  parseQueryLimit,
  recordMetricEvent,
} from "./integrations.js";
import { emitWebhookEvent } from "./webhooks.js";
import { logSystemEvent } from "./system-logs.js";
import {
  completeTask,
  createTaskFromWorkflow,
  deleteTask,
  generateNudgeSteps,
  getTask,
  listTasks,
  searchTasks,
  simplifyNudgeStep,
  updateTask,
} from "./tasks.js";

const MCP_KEY_PREFIX = "mcp";
export const SYSTEM_MCP_TOOL_DEFINITIONS = [
  {
    name: "create_draft_reply",
    title: "Create Draft Reply",
    description: "Create a draft reply in the connected account that owns the message, using the same behavior as the REST Create Draft Reply API.",
  },
  {
    name: "add_labels_on_email",
    title: "Add Labels On Email",
    description: "Classify an email with label candidates. Applies the uniquely highest-confidence label when it meets the current threshold; otherwise creates a pending email rule.",
  },
  {
    name: "query_email_rules",
    title: "Query Email Rules",
    description: "Query Emailable email rules by fromEmail/from, fromName, subject, isPending/pending, AND/OR groups, and supported equivalence operators.",
  },
  {
    name: "find_email",
    title: "Find Email",
    description: "Search Emailable's indexed email database by id, subject, sender, account, label, archive/draft/sent/inbox state, read/unread status, and timestamps. Provider-wide connected-account search is optional.",
  },
  {
    name: "searchTasks",
    title: "Search Tasks",
    description: "Fuzzy search the user's incomplete Emailable tasks by title.",
  },
  {
    name: "createTask",
    title: "Create Task",
    description: "Create a task, or increment an existing task's duplicate count when a sufficiently similar incomplete task already exists.",
  },
  {
    name: "getTask",
    title: "Get Task",
    description: "Get a single task by id.",
  },
  {
    name: "editTask",
    title: "Edit Task",
    description: "Edit user-controlled task fields including title, notes, tags, priority, due date, project, and source email id.",
  },
  {
    name: "deleteTask",
    title: "Delete Task",
    description: "Delete a task.",
  },
  {
    name: "completeTask",
    title: "Complete Task",
    description: "Close or complete an open task.",
  },
  {
    name: "listTasks",
    title: "List Tasks",
    description: "List incomplete tasks sorted by Emailable's effective priority score.",
  },
  {
    name: "generateNudgeSteps",
    title: "Generate Nudge Steps",
    description: "Generate small next steps for a stuck task.",
  },
  {
    name: "simplifyNudgeStep",
    title: "Simplify Nudge Step",
    description: "Rewrite the current nudge step so it is easier to act on.",
  },
];

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
  await dbPool.query("alter table user_settings add column if not exists mcp_client_enabled boolean not null default false");
  await dbPool.query("alter table user_settings add column if not exists encrypted_internal_mcp_token text");
  await dbPool.query("alter table user_settings add column if not exists internal_mcp_token_hash text");
  await dbPool.query("create index if not exists user_settings_internal_mcp_token_hash_idx on user_settings(internal_mcp_token_hash)");
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

      const status = await getMcpServerStatus(req.user.id);
      res.json({ keys: result.rows, ...status });
    } catch (error) {
      handleHttpError(res, error);
    }
  });

  app.post("/api/mcp-api-keys", requireSession, async (req, res) => {
    const name = typeof req.body?.name === "string" && req.body.name.trim() ? req.body.name.trim() : "MCP client";
    const token = createMcpApiKey();
    const keyPrefix = token.slice(0, 12);

    try {
      const status = await getMcpServerStatus(req.user.id);
      if (status.disabled) {
        res.status(409).json({ error: "MCP Server is disabled while MCP Client is active." });
        return;
      }

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
        bodyText: z.string().trim().min(1).describe("Non-empty plain text body for the draft reply."),
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

  server.registerTool(
    "find_email",
    {
      title: "Find Email",
      description: "Search Emailable's indexed email database first for emails and counts by id, subject, from, to/account, label, inbox/archive/trash/draft/sent state, read/unread status, and received/sent timestamps. Set searchConnectedAccounts to true when indexed results are missing or too shallow and a deeper connected-provider search is needed.",
      inputSchema: {
        emailId: z.string().optional().describe("Provider email/message id or RFC822 Message-ID."),
        subject: z.string().optional().describe("Subject text to search for."),
        from: z.string().optional().describe("Sender email address or display text to match."),
        to: z.string().optional().describe("Recipient/connected account email address to search in."),
        state: z.string().optional().describe("Optional mailbox/state filter such as inbox, sent, drafts, archive, archived, read, unread, or a label/folder name."),
        label: z.string().optional().describe("Optional Emailable label/folder name to filter by."),
        limit: z.number().min(1).max(200).optional().describe("Maximum indexed results to return. Use a small limit for examples and a larger limit for counting."),
        searchConnectedAccounts: z.boolean().optional().describe("When true, search connected email providers if the indexed database does not contain enough information. Use for deep searches across archive, trash, drafts, sent mail, or older/unindexed messages."),
      },
    },
    async (input) => {
      return loggedMcpToolResult(userId, "find_email", input, "internal:find-email", () => findEmailTool(userId, input));
    },
  );

  server.registerTool(
    "searchTasks",
    {
      title: "Search Tasks",
      description: "Fuzzy search incomplete Emailable tasks by title. This is not substring search; use natural task titles.",
      inputSchema: {
        title: z.string().min(1).describe("Task title or natural language title to fuzzy search."),
        limit: z.number().int().min(1).max(5).optional(),
      },
    },
    async (input) => {
      return loggedMcpToolResult(userId, "searchTasks", input, "/api/tasks/search", () => searchTasks(userId, input));
    },
  );

  server.registerTool(
    "createTask",
    {
      title: "Create Task",
      description: "Create a task. If a sufficiently similar incomplete task already exists, Emailable increments duplicate_count instead of creating a duplicate.",
      inputSchema: taskInputSchema(),
    },
    async (input) => {
      return loggedMcpToolResult(userId, "createTask", input, "/api/tasks", () => createTaskFromWorkflow(userId, input));
    },
  );

  server.registerTool(
    "getTask",
    {
      title: "Get Task",
      description: "Get a single task by id using the same behavior as the REST Get Task API.",
      inputSchema: {
        id: z.string().uuid(),
      },
    },
    async (input) => {
      return loggedMcpToolResult(userId, "getTask", input, `/api/tasks/${input.id}`, async () => {
        const task = await getTask(userId, input.id);
        if (!task) {
          throw new Error("Task not found");
        }
        return { task };
      });
    },
  );

  server.registerTool(
    "editTask",
    {
      title: "Edit Task",
      description: "Edit user-controlled task fields.",
      inputSchema: {
        id: z.string().uuid(),
        ...taskInputSchema({ partial: true }),
      },
    },
    async (input) => {
      const { id, ...updates } = input;
      return loggedMcpToolResult(userId, "editTask", input, `/api/tasks/${id}`, () => updateTask(userId, id, updates));
    },
  );

  server.registerTool(
    "deleteTask",
    {
      title: "Delete Task",
      description: "Delete a task.",
      inputSchema: {
        id: z.string().uuid(),
      },
    },
    async (input) => {
      return loggedMcpToolResult(userId, "deleteTask", input, `/api/tasks/${input.id}`, async () => {
        await deleteTask(userId, input.id);
        return { ok: true };
      });
    },
  );

  server.registerTool(
    "completeTask",
    {
      title: "Complete Task",
      description: "Close or complete an open task.",
      inputSchema: {
        id: z.string().uuid(),
      },
    },
    async (input) => {
      return loggedMcpToolResult(userId, "completeTask", input, `/api/tasks/${input.id}/complete`, () => completeTask(userId, input.id));
    },
  );

  server.registerTool(
    "listTasks",
    {
      title: "List Tasks",
      description: "List incomplete tasks sorted by effective score. Lower effective_score means higher priority.",
      inputSchema: {
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async (input) => {
      return loggedMcpToolResult(userId, "listTasks", input, "/api/tasks", async () => {
        const tasks = await listTasks(userId, { limit: input.limit ?? 200 });
        return { tasks, top3: tasks.slice(0, 3) };
      });
    },
  );

  server.registerTool(
    "generateNudgeSteps",
    {
      title: "Generate Nudge Steps",
      description: "Generate small next steps for a stuck or deferred task.",
      inputSchema: {
        id: z.string().uuid(),
      },
    },
    async (input) => {
      return loggedMcpToolResult(userId, "generateNudgeSteps", input, `/api/tasks/${input.id}/nudge/generate`, () => generateNudgeSteps(userId, input.id));
    },
  );

  server.registerTool(
    "simplifyNudgeStep",
    {
      title: "Simplify Nudge Step",
      description: "Simplify the current nudge step for a task.",
      inputSchema: {
        id: z.string().uuid(),
      },
    },
    async (input) => {
      return loggedMcpToolResult(userId, "simplifyNudgeStep", input, `/api/tasks/${input.id}/nudge/simplify`, () => simplifyNudgeStep(userId, input.id));
    },
  );

  return server;
}

function taskInputSchema({ partial = false } = {}) {
  const title = z.string().trim().min(1).max(160).describe("Task title.");
  return {
    title: partial ? title.optional() : title,
    notes: z.string().max(4000).optional(),
    tags: z.array(z.string().max(40)).max(12).optional(),
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional().describe("1 is highest priority, 3 is lowest priority."),
    dueDate: z.string().optional().describe("Optional ISO due date."),
    project: z.string().max(80).optional(),
    sourceEmailId: z.string().max(255).optional(),
  };
}

async function findEmailTool(userId, payload) {
  return { emails: await findConnectedEmailsForMcp(userId, payload) };
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
  const normalizedPayload = {
    ...payload,
    snippet: typeof payload?.snippet === "string" && payload.snippet.trim()
      ? payload.snippet
      : "No message preview available.",
  };
  const input = await parseLabelClassificationInput(userId, normalizedPayload);
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

  const internalResult = await dbPool.query(
    `
      select user_id as "userId"
      from user_settings
      where internal_mcp_token_hash = $1
      limit 1
    `,
    [hashInternalMcpToken(token)],
  );
  if (internalResult.rows[0]?.userId) {
    return { ok: true, userId: internalResult.rows[0].userId, internal: true };
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
    if (await isMcpClientEnabled(userId)) {
      return { ok: false, error: "MCP Server is disabled while MCP Client is active" };
    }

    return { ok: true, userId };
}

async function getMcpServerStatus(userId) {
  return {
    disabled: await isMcpClientEnabled(userId),
    disabledReason: "MCP Client is active. Emailable is handling AI requests and logic directly.",
  };
}

async function isMcpClientEnabled(userId) {
  const result = await dbPool.query(
    `
      insert into user_settings (user_id, confidence_threshold)
      values ($1, 0.9)
      on conflict (user_id) do nothing
      returning mcp_client_enabled as "mcpClientEnabled"
    `,
    [userId],
  );
  if (result.rows[0]) {
    return Boolean(result.rows[0].mcpClientEnabled);
  }
  const existing = await dbPool.query(`select mcp_client_enabled as "mcpClientEnabled" from user_settings where user_id = $1`, [userId]);
  return Boolean(existing.rows[0]?.mcpClientEnabled);
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

function hashInternalMcpToken(token) {
  return crypto.createHash("sha256").update(`internal-mcp:${token}`).digest("hex");
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
