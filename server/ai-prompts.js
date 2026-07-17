import { randomUUID } from "node:crypto";
import { resolveRequestUser } from "./session.js";
import { dbPool } from "./db.js";
import { getConnectedEmailAccounts, getValidEmailAccountAccessToken } from "./email-accounts.js";
import { searchImapSentEmailContexts } from "./imap-provider.js";
import { getConfidenceThreshold } from "./settings.js";

export const PROMPT_DEFINITIONS = {
  "email-label": {
    title: "Email Label",
    defaultMarkdown: `You are an email labeling assistant.

Use the confidence threshold of {confidenceThreshold} to decide whether an email can be labeled automatically.

Available labels:

{labelTable}`,
  },
  "draft-reply": {
    title: "Draft Reply",
    defaultMarkdown: `You are an email reply assistant.

The voice should be warm but not overly casual. Use simple sentences and make the message clear and tactful. Do not use emojis or slang or colloquial terminology.

Use the email examples below to get a better understand on what replies should sound like:`,
  },
};

const TEMPLATE_TOKENS = ["{confidenceThreshold}", "{labelTable}"];

export async function ensureAiPromptsTable() {
  if (!dbPool) {
    return;
  }

  await dbPool.query(`
    create table if not exists ai_prompts (
      id uuid primary key,
      user_id text not null references "user"(id) on delete cascade,
      prompt_key text not null,
      markdown text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (user_id, prompt_key)
    )
  `);
  await dbPool.query("create index if not exists ai_prompts_user_id_idx on ai_prompts(user_id)");

  await dbPool.query(`
    create table if not exists custom_ai_prompts (
      id uuid primary key,
      user_id text not null references "user"(id) on delete cascade,
      name text not null,
      description text not null default '',
      markdown text not null default '',
      tool_choice text not null default 'auto',
      selected_tools jsonb not null default '[]'::jsonb,
      selected_label_ids jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint custom_ai_prompts_tool_choice_check check (tool_choice in ('auto', 'required'))
    )
  `);
  await dbPool.query("alter table custom_ai_prompts add column if not exists selected_label_ids jsonb not null default '[]'::jsonb");
  await dbPool.query("create index if not exists custom_ai_prompts_user_id_idx on custom_ai_prompts(user_id)");
}

export function registerAiPromptRoutes(app) {
  app.get("/api/ai-prompts/custom", requireSession, async (req, res) => {
    try {
      res.json({ prompts: await listCustomAiPrompts(req.user.id) });
    } catch (error) {
      handleDbError(res, error);
    }
  });

  app.post("/api/ai-prompts/custom", requireSession, async (req, res) => {
    const input = parseCustomPromptInput(req.body);
    if (!input.ok) {
      res.status(400).json({ error: input.error });
      return;
    }

    try {
      const prompt = await createCustomAiPrompt(req.user.id, input.prompt);
      res.status(201).json({ prompt });
    } catch (error) {
      handleDbError(res, error);
    }
  });

  app.get("/api/ai-prompts/custom/:promptId", requireSession, async (req, res) => {
    try {
      const prompt = await getCustomAiPrompt(req.user.id, req.params.promptId);
      if (!prompt) {
        res.status(404).json({ error: "AI prompt not found" });
        return;
      }
      res.json({ prompt });
    } catch (error) {
      handleDbError(res, error);
    }
  });

  app.put("/api/ai-prompts/custom/:promptId", requireSession, async (req, res) => {
    const input = parseCustomPromptInput(req.body);
    if (!input.ok) {
      res.status(400).json({ error: input.error });
      return;
    }

    try {
      const prompt = await updateCustomAiPrompt(req.user.id, req.params.promptId, input.prompt);
      if (!prompt) {
        res.status(404).json({ error: "AI prompt not found" });
        return;
      }
      res.json({ prompt });
    } catch (error) {
      handleDbError(res, error);
    }
  });

  app.delete("/api/ai-prompts/custom", requireSession, async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id) => typeof id === "string") : [];
    if (ids.length === 0) {
      res.status(400).json({ error: "Select at least one prompt to delete" });
      return;
    }

    try {
      const deleted = await deleteCustomAiPrompts(req.user.id, ids);
      res.json({ deleted });
    } catch (error) {
      handleDbError(res, error);
    }
  });

  app.delete("/api/ai-prompts/custom/:promptId", requireSession, async (req, res) => {
    try {
      const deleted = await deleteCustomAiPrompts(req.user.id, [req.params.promptId]);
      if (deleted === 0) {
        res.status(404).json({ error: "AI prompt not found" });
        return;
      }
      res.json({ deleted });
    } catch (error) {
      handleDbError(res, error);
    }
  });

  app.get("/api/ai-prompts/:promptKey", requireSession, async (req, res) => {
    const definition = PROMPT_DEFINITIONS[req.params.promptKey];

    if (!definition) {
      res.status(404).json({ error: "AI prompt not found" });
      return;
    }

    try {
      const prompt = await getAiPrompt(req.user.id, req.params.promptKey);
      res.json({
        promptKey: req.params.promptKey,
        title: definition.title,
        markdown: prompt?.markdown ?? definition.defaultMarkdown,
        templateTokens: TEMPLATE_TOKENS,
      });
    } catch (error) {
      handleDbError(res, error);
    }
  });

  app.put("/api/ai-prompts/:promptKey", requireSession, async (req, res) => {
    const definition = PROMPT_DEFINITIONS[req.params.promptKey];
    const input = parsePromptInput(req.body);

    if (!definition) {
      res.status(404).json({ error: "AI prompt not found" });
      return;
    }

    if (!input.ok) {
      res.status(400).json({ error: input.error });
      return;
    }

    try {
      const prompt = await saveAiPrompt(req.user.id, req.params.promptKey, input.markdown);
      res.json({ prompt });
    } catch (error) {
      handleDbError(res, error);
    }
  });

  app.post("/api/ai-prompts/:promptKey/preview", requireSession, async (req, res) => {
    const definition = PROMPT_DEFINITIONS[req.params.promptKey];
    const input = parsePromptInput(req.body);

    if (!definition) {
      res.status(404).json({ error: "AI prompt not found" });
      return;
    }

    if (!input.ok) {
      res.status(400).json({ error: input.error });
      return;
    }

    try {
      res.json({ markdown: await renderPrompt(req.user.id, input.markdown) });
    } catch (error) {
      handleDbError(res, error);
    }
  });

  app.post("/api/ai-prompts/draft-reply/sent-email-search", requireSession, async (req, res) => {
    const recipient = typeof req.body?.recipient === "string" ? req.body.recipient.trim() : "";
    const subject = typeof req.body?.subject === "string" ? req.body.subject.trim() : "";

    if (!recipient && !subject) {
      res.status(400).json({ error: "Recipient or subject is required" });
      return;
    }

    try {
      const emails = await searchSentEmailContexts(req.user.id, { recipient, subject });
      res.json({
        emails: emails.map((email) => ({
          ...email,
          markdown: emailContextToMarkdownTable(email),
        })),
      });
    } catch (error) {
      handleDbError(res, error);
    }
  });
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

function parsePromptInput(body) {
  const markdown = typeof body?.markdown === "string" ? body.markdown : "";

  if (markdown.length > 20_000) {
    return { ok: false, error: "Prompt must be 20,000 characters or less" };
  }

  if (/!\[[^\]]*]\([^)]*\)/.test(markdown) || /<img[\s>]/i.test(markdown)) {
    return { ok: false, error: "Images are not supported in AI prompts" };
  }

  return { ok: true, markdown };
}

function parseCustomPromptInput(body) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const markdown = typeof body?.markdown === "string" ? body.markdown : "";
  const toolChoice = body?.toolChoice === "required" ? "required" : "auto";
  const selectedToolsInput = Array.isArray(body?.selectedTools) ? body.selectedTools : [];
  const selectedLabelIdsInput = Array.isArray(body?.selectedLabelIds) ? body.selectedLabelIds : [];

  if (!name) {
    return { ok: false, error: "Prompt name is required" };
  }
  if (name.length > 100) {
    return { ok: false, error: "Prompt name must be 100 characters or less" };
  }
  if (description.length > 500) {
    return { ok: false, error: "Prompt description must be 500 characters or less" };
  }

  const markdownInput = parsePromptInput({ markdown });
  if (!markdownInput.ok) {
    return markdownInput;
  }

  const selectedTools = [];
  const seen = new Set();
  for (const entry of selectedToolsInput) {
    const toolClientId = typeof entry?.toolClientId === "string" ? entry.toolClientId.trim() : "";
    const toolName = typeof entry?.toolName === "string" ? entry.toolName.trim() : "";
    const key = `${toolClientId}:${toolName}`;
    if (!toolClientId || !toolName || seen.has(key)) {
      continue;
    }
    seen.add(key);
    selectedTools.push({ toolClientId, toolName });
  }

  if (selectedTools.length > 50) {
    return { ok: false, error: "Select 50 tools or fewer" };
  }

  const selectedLabelIds = [];
  const seenLabelIds = new Set();
  for (const labelId of selectedLabelIdsInput) {
    const normalizedLabelId = typeof labelId === "string" ? labelId.trim() : "";
    if (!normalizedLabelId || seenLabelIds.has(normalizedLabelId)) {
      continue;
    }
    if (!isUuid(normalizedLabelId)) {
      return { ok: false, error: "Selected labels are invalid" };
    }
    seenLabelIds.add(normalizedLabelId);
    selectedLabelIds.push(normalizedLabelId);
  }

  if (selectedLabelIds.length === 0) {
    return { ok: false, error: "Select at least one label for this prompt" };
  }
  if (selectedLabelIds.length > 100) {
    return { ok: false, error: "Select 100 labels or fewer" };
  }

  return {
    ok: true,
    prompt: {
      name,
      description,
      markdown,
      toolChoice,
      selectedTools,
      selectedLabelIds,
    },
  };
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function getAiPrompt(userId, promptKey) {
  const result = await dbPool.query(
    `
      select prompt_key as "promptKey", markdown, created_at as "createdAt", updated_at as "updatedAt"
      from ai_prompts
      where user_id = $1 and prompt_key = $2
      limit 1
    `,
    [userId, promptKey],
  );

  return result.rows[0] ?? null;
}

async function saveAiPrompt(userId, promptKey, markdown) {
  const result = await dbPool.query(
    `
      insert into ai_prompts (id, user_id, prompt_key, markdown)
      values ($1, $2, $3, $4)
      on conflict (user_id, prompt_key) do update
      set markdown = excluded.markdown,
          updated_at = now()
      returning prompt_key as "promptKey", markdown, created_at as "createdAt", updated_at as "updatedAt"
    `,
    [randomUUID(), userId, promptKey, markdown],
  );

  return result.rows[0];
}

export async function listCustomAiPrompts(userId) {
  const result = await dbPool.query(
    `
      select id, name, description, markdown, tool_choice as "toolChoice",
             selected_tools as "selectedTools", selected_label_ids as "selectedLabelIds",
             created_at as "createdAt", updated_at as "updatedAt"
      from custom_ai_prompts
      where user_id = $1
      order by updated_at desc, created_at desc
    `,
    [userId],
  );

  return result.rows.map(normalizeCustomPromptRow);
}

async function getCustomAiPrompt(userId, promptId) {
  const result = await dbPool.query(
    `
      select id, name, description, markdown, tool_choice as "toolChoice",
             selected_tools as "selectedTools", selected_label_ids as "selectedLabelIds",
             created_at as "createdAt", updated_at as "updatedAt"
      from custom_ai_prompts
      where user_id = $1 and id = $2
      limit 1
    `,
    [userId, promptId],
  );

  return result.rows[0] ? normalizeCustomPromptRow(result.rows[0]) : null;
}

async function createCustomAiPrompt(userId, prompt) {
  const result = await dbPool.query(
    `
      insert into custom_ai_prompts (id, user_id, name, description, markdown, tool_choice, selected_tools, selected_label_ids)
      values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
      returning id, name, description, markdown, tool_choice as "toolChoice",
                selected_tools as "selectedTools", selected_label_ids as "selectedLabelIds",
                created_at as "createdAt", updated_at as "updatedAt"
    `,
    [
      randomUUID(),
      userId,
      prompt.name,
      prompt.description,
      prompt.markdown,
      prompt.toolChoice,
      JSON.stringify(prompt.selectedTools),
      JSON.stringify(prompt.selectedLabelIds),
    ],
  );

  return normalizeCustomPromptRow(result.rows[0]);
}

async function updateCustomAiPrompt(userId, promptId, prompt) {
  const result = await dbPool.query(
    `
      update custom_ai_prompts
      set name = $3,
          description = $4,
          markdown = $5,
          tool_choice = $6,
          selected_tools = $7::jsonb,
          selected_label_ids = $8::jsonb,
          updated_at = now()
      where user_id = $1 and id = $2
      returning id, name, description, markdown, tool_choice as "toolChoice",
                selected_tools as "selectedTools", selected_label_ids as "selectedLabelIds",
                created_at as "createdAt", updated_at as "updatedAt"
    `,
    [
      userId,
      promptId,
      prompt.name,
      prompt.description,
      prompt.markdown,
      prompt.toolChoice,
      JSON.stringify(prompt.selectedTools),
      JSON.stringify(prompt.selectedLabelIds),
    ],
  );

  return result.rows[0] ? normalizeCustomPromptRow(result.rows[0]) : null;
}

async function deleteCustomAiPrompts(userId, promptIds) {
  const result = await dbPool.query(
    `
      delete from custom_ai_prompts
      where user_id = $1 and id = any($2::uuid[])
    `,
    [userId, promptIds],
  );

  return result.rowCount ?? 0;
}

function normalizeCustomPromptRow(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    markdown: row.markdown ?? "",
    toolChoice: row.toolChoice === "required" ? "required" : "auto",
    selectedTools: Array.isArray(row.selectedTools) ? row.selectedTools : [],
    selectedLabelIds: Array.isArray(row.selectedLabelIds) ? row.selectedLabelIds : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getRenderedAiPromptBundle(userId) {
  const [threshold, labels] = await Promise.all([getConfidenceThreshold(userId), getSyncedLabels(userId)]);
  const renderedLabels = labels.map((label) => ({
    name: label.name,
    description: renderTemplateDescription(label.description, threshold),
  }));
  const savedPrompts = await getAiPromptsByKey(userId);
  const bundle = {
    confidenceThreshold: threshold,
    labels: renderedLabels,
  };

  for (const [promptKey, definition] of Object.entries(PROMPT_DEFINITIONS)) {
    const markdown = savedPrompts.get(promptKey)?.markdown ?? definition.defaultMarkdown;
    bundle[promptKey] = {
      markdown: renderPromptMarkdown(markdown, threshold, renderedLabels),
    };
  }

  return bundle;
}

export async function getRenderedCoreContent(userId) {
  const [labelInstructions, prompts] = await Promise.all([
    getRenderedLabelInstructions(userId),
    listCustomAiPrompts(userId),
  ]);

  return {
    confidenceThreshold: labelInstructions.confidenceThreshold,
    labels: labelInstructions.labels,
    customPrompts: await Promise.all(prompts.map(async (prompt) => ({
      id: prompt.id,
      name: prompt.name,
      description: prompt.description,
      markdown: await renderPrompt(userId, prompt.markdown),
      toolChoice: prompt.toolChoice,
      selectedTools: prompt.selectedTools,
      selectedLabelIds: prompt.selectedLabelIds,
    }))),
  };
}

async function renderPrompt(userId, markdown) {
  const [threshold, labels] = await Promise.all([getConfidenceThreshold(userId), getSyncedLabels(userId)]);
  const renderedLabels = labels.map((label) => ({
    name: label.name,
    description: renderTemplateDescription(label.description, threshold),
  }));

  return renderPromptMarkdown(markdown, threshold, renderedLabels);
}

export async function renderAiPromptMarkdownForUser(userId, markdown) {
  return renderPrompt(userId, markdown);
}

export async function getRenderedLabelInstructions(userId) {
  const [threshold, labels] = await Promise.all([getConfidenceThreshold(userId), getSyncedLabels(userId)]);
  const renderedLabels = labels.map((label) => ({
    name: label.name,
    description: renderTemplateDescription(label.description, threshold),
  }));

  return {
    confidenceThreshold: threshold,
    labelTable: labelsToMarkdownTable(renderedLabels),
    labels: renderedLabels,
  };
}

function renderPromptMarkdown(markdown, threshold, labels) {
  return markdown
    .split("{confidenceThreshold}")
    .join(Number(threshold).toFixed(2))
    .split("{labelTable}")
    .join(labelsToMarkdownTable(labels));
}

function renderTemplateDescription(description, confidenceThreshold) {
  return String(description ?? "").split("{confidenceThreshold}").join(String(confidenceThreshold));
}

async function getAiPromptsByKey(userId) {
  const result = await dbPool.query(
    `
      select prompt_key as "promptKey", markdown
      from ai_prompts
      where user_id = $1
    `,
    [userId],
  );

  return new Map(result.rows.map((prompt) => [prompt.promptKey, prompt]));
}

async function getSyncedLabels(userId) {
  const result = await dbPool.query(
    `
      with account_count as (
        select count(*)::int as total
        from email_accounts
        where user_id = $1
      )
      select l.name, l.description
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
      order by lower(l.name), l.created_at desc
    `,
    [userId],
  );

  return result.rows;
}

function labelsToMarkdownTable(labels) {
  if (labels.length === 0) {
    return "| Name | Description |\n| --- | --- |\n| No synced labels | |";
  }

  return [
    "| Name | Description |",
    "| --- | --- |",
    ...labels.map((label) => `| ${escapeTableCell(label.name)} | ${escapeTableCell(label.description || "")} |`),
  ].join("\n");
}

async function searchSentEmailContexts(userId, filters) {
  const accounts = await getConnectedEmailAccounts(userId);
  const results = [];

  for (const account of accounts) {
    if (results.length >= 10) {
      break;
    }

    try {
      const accessToken = await getValidEmailAccountAccessToken(account);

      if (account.provider === "gmail") {
        const emails = await searchGmailSentEmailContexts(accessToken, filters, 10 - results.length);
        results.push(...emails.map((email) => ({ ...email, accountEmail: account.email, provider: account.provider })));
      } else if (["imap", "yahoo", "microsoft"].includes(account.provider)) {
        const accessToken = account.provider === "imap" ? "" : await getValidEmailAccountAccessToken(account);
        const emails = await searchImapSentEmailContexts(account, filters, 10 - results.length, accessToken);
        results.push(...emails.map((email) => ({ ...email, accountEmail: account.email, provider: account.provider })));
      }
    } catch (error) {
      if (error.status !== 404) {
        console.warn(`Sent email search failed for ${account.provider} ${account.email}:`, error.message);
      }
    }
  }

  return results;
}

async function fetchGmailMessageById(accessToken, emailId) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(emailId.trim())}`);
  url.searchParams.set("format", "full");

  const response = await providerFetch(url.toString(), accessToken, { method: "GET" });
  return response.json();
}

async function searchGmailSentEmailContexts(accessToken, filters, limit) {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("q", getGmailSentSearchQuery(filters));
  url.searchParams.set("maxResults", String(Math.min(Math.max(limit, 1), 10)));

  const response = await providerFetch(url.toString(), accessToken, { method: "GET" });
  const data = await response.json();
  const messages = data.messages ?? [];
  const contexts = [];

  for (const item of messages) {
    const message = await fetchGmailMessageById(accessToken, item.id);
    contexts.push(gmailMessageToEmailContext(message, item.id));
  }

  return contexts;
}

function getGmailSentSearchQuery(filters) {
  const parts = ["in:sent"];

  if (filters.recipient) {
    parts.push(`to:${quoteGmailSearchValue(filters.recipient)}`);
  }

  if (filters.subject) {
    parts.push(`subject:${quoteGmailSearchValue(filters.subject)}`);
  }

  return parts.join(" ");
}

function quoteGmailSearchValue(value) {
  const escaped = String(value).trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function gmailMessageToEmailContext(message, fallbackEmailId) {
  const headers = getGmailHeaders(message);

  return {
    emailId: message.id || fallbackEmailId,
    to: formatEmailList(headers.to || "") || extractEmailAddress(headers.from || ""),
    subject: headers.subject || "",
    bodyText: extractGmailTextBody(message.payload) || message.snippet || "",
  };
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

function getGmailHeaders(message) {
  const headers = message.payload?.headers ?? [];
  return Object.fromEntries(headers.map((header) => [String(header.name).toLowerCase(), header.value]));
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

function extractEmailAddress(value) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim();
}

function formatEmailList(value) {
  return String(value)
    .split(",")
    .map((item) => extractEmailAddress(item))
    .filter(Boolean)
    .join(", ");
}

function stripHtml(value) {
  return String(value)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function emailContextToMarkdownTable(email) {
  return [
    "| To | Subject | BodyText |",
    "| --- | --- | --- |",
    `| ${escapeTableCell(email.to)} | ${escapeTableCell(email.subject)} | ${escapeTableCell(email.bodyText)} |`,
  ].join("\n");
}

function escapeTableCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function handleDbError(res, error) {
  console.error("AI prompts API failed:", error);
  res.status(500).json({ error: "AI prompt request failed" });
}
