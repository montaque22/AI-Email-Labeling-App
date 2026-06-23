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
}

export function registerAiPromptRoutes(app) {
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

async function renderPrompt(userId, markdown) {
  const [threshold, labels] = await Promise.all([getConfidenceThreshold(userId), getSyncedLabels(userId)]);
  const renderedLabels = labels.map((label) => ({
    name: label.name,
    description: renderTemplateDescription(label.description, threshold),
  }));

  return renderPromptMarkdown(markdown, threshold, renderedLabels);
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
