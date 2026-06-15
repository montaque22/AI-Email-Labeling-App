import crypto from "node:crypto";
import { auth } from "./auth.js";
import { dbPool } from "./db.js";
import { getRenderedAiPromptBundle } from "./ai-prompts.js";
import { getValidEmailAccountAccessToken } from "./email-accounts.js";
import {
  buildDraftWebhookPayload,
  classifyEmailWithLabelCandidates,
  createProviderReplyDraft,
  findConnectedEmailContextById,
  parseLabelClassificationInput,
  requireApiKey,
  tryApplyUnemailableLabel,
} from "./integrations.js";
import { emitWebhookEvent } from "./webhooks.js";
import { logSystemEvent } from "./system-logs.js";

const SECRET = process.env.BETTER_AUTH_SECRET || "local-byoai-secret";
const clientEncryptionKeyPair = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const PROVIDER_DEFINITIONS = {
  openai: {
    label: "ChatGPT",
    defaultModel: "gpt-4.1-mini",
    models: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"],
  },
  gemini: {
    label: "Gemini",
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
  },
  anthropic: {
    label: "Anthropic",
    defaultModel: "claude-sonnet-4-5",
    models: ["claude-sonnet-4-5", "claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"],
  },
  ollama: {
    label: "Ollama",
    defaultModel: "",
    models: [],
    local: true,
  },
};
const AI_LABEL_MAX_CANDIDATES = 3;
const AI_LABEL_NAME_MAX_LENGTH = 25;
const AI_LABEL_REASON_MAX_LENGTH = 200;

export async function ensureByoAiTables() {
  if (!dbPool) {
    return;
  }

  await dbPool.query(`
    create table if not exists ai_platforms (
      id uuid primary key,
      user_id text not null references "user"(id) on delete cascade,
      provider text not null,
      model text not null,
      encrypted_api_key text,
      base_url text,
      encrypted_bearer_token text,
      sort_order int not null default 0,
      status text not null default 'untested',
      last_error text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await dbPool.query("create index if not exists ai_platforms_user_id_idx on ai_platforms(user_id, sort_order)");
  await dbPool.query("alter table user_settings add column if not exists ai_enabled boolean not null default false");
  await dbPool.query(`
    create table if not exists ai_mcp_clients (
      user_id text primary key references "user"(id) on delete cascade,
      server_url text not null default '',
      encrypted_bearer_token text,
      enabled boolean not null default false,
      status text not null default 'untested',
      last_error text,
      tools jsonb not null default '[]'::jsonb,
      selected_tools jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
}

export function registerByoAiRoutes(app) {
  app.get("/api/byoai/client-encryption-key", requireSession, (_req, res) => {
    res.json({ publicKey: clientEncryptionKeyPair.publicKey });
  });

  app.get("/api/byoai/config", requireSession, async (req, res) => {
    try {
      const [platforms, settings, mcpClient] = await Promise.all([
        listAiPlatforms(req.user.id),
        getAiSettings(req.user.id),
        getMcpClientConfig(req.user.id),
      ]);
      res.json({
        providers: PROVIDER_DEFINITIONS,
        platforms,
        aiEnabled: settings.aiEnabled && platforms.some((platform) => platform.status === "connected"),
        canEnableAi: platforms.some((platform) => platform.status === "connected"),
        mcpClient,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.put("/api/byoai/settings", requireSession, async (req, res) => {
    try {
      const enabled = Boolean(req.body?.aiEnabled);
      const platforms = await listAiPlatforms(req.user.id);
      if (enabled && !platforms.some((platform) => platform.status === "connected")) {
        res.status(400).json({ error: "Add and save a working AI platform before enabling AI." });
        return;
      }

      const settings = await updateAiEnabled(req.user.id, enabled);
      res.json(settings);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/byoai/platforms", requireSession, async (req, res) => {
    try {
      const input = parsePlatformInput(req.body);
      if (!input.ok) {
        res.status(400).json({ error: input.error });
        return;
      }

      const count = await getAiPlatformCount(req.user.id);
      if (count >= 3) {
        res.status(400).json({ error: "You can save up to 3 AI platforms." });
        return;
      }

      await testAiPlatform(input.platform);
      const platform = await createAiPlatform(req.user.id, input.platform);
      await logSystemEvent(req.user.id, {
        category: "ai",
        eventName: "ai_platform.connected",
        status: "success",
        message: `${platform.providerLabel} connected.`,
        payload: { provider: platform.provider, model: platform.model },
      });
      res.status(201).json({ platform, message: "AI platform connection tested successfully." });
    } catch (error) {
      await logSystemEvent(req.user?.id, {
        category: "ai",
        eventName: "ai_platform.connection_failed",
        status: "error",
        message: error.message,
        payload: { provider: req.body?.provider, model: req.body?.model },
      });
      handleError(res, error);
    }
  });

  app.put("/api/byoai/platforms/:id", requireSession, async (req, res) => {
    try {
      const input = parsePlatformInput(req.body);
      if (!input.ok) {
        res.status(400).json({ error: input.error });
        return;
      }

      await testAiPlatform(input.platform);
      const platform = await updateAiPlatform(req.user.id, req.params.id, input.platform);
      if (!platform) {
        res.status(404).json({ error: "AI platform not found." });
        return;
      }

      await logSystemEvent(req.user.id, {
        category: "ai",
        eventName: "ai_platform.connected",
        status: "success",
        message: `${platform.providerLabel} updated and connected.`,
        payload: { provider: platform.provider, model: platform.model },
      });
      res.json({ platform, message: "AI platform connection tested successfully." });
    } catch (error) {
      await logSystemEvent(req.user?.id, {
        category: "ai",
        eventName: "ai_platform.connection_failed",
        status: "error",
        message: error.message,
        payload: { provider: req.body?.provider, model: req.body?.model },
      });
      handleError(res, error);
    }
  });

  app.put("/api/byoai/platforms/order", requireSession, async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id) => typeof id === "string") : [];
    if (ids.length === 0 || ids.length > 3) {
      res.status(400).json({ error: "ids must include 1 to 3 platform ids." });
      return;
    }

    try {
      await reorderAiPlatforms(req.user.id, ids);
      res.json({ platforms: await listAiPlatforms(req.user.id) });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.delete("/api/byoai/platforms/:id", requireSession, async (req, res) => {
    try {
      await dbPool.query("delete from ai_platforms where user_id = $1 and id = $2", [req.user.id, req.params.id]);
      const platforms = await normalizePlatformOrder(req.user.id);
      if (!platforms.some((platform) => platform.status === "connected")) {
        await updateAiEnabled(req.user.id, false);
      }
      await logSystemEvent(req.user.id, {
        category: "ai",
        eventName: "ai_platform.deleted",
        status: "warning",
        message: "AI platform deleted.",
        payload: { id: req.params.id },
      });
      res.json({ deleted: true, platforms, ...(await getAiSettings(req.user.id)) });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/byoai/mcp-client", requireSession, async (req, res) => {
    try {
      const input = parseMcpClientInput(req.body);
      if (!input.ok) {
        res.status(400).json({ error: input.error });
        return;
      }

      const tools = await fetchMcpServerTools(input.config);
      const mcpClient = await saveMcpClientConfig(req.user.id, {
        ...input.config,
        enabled: false,
        status: "connected",
        lastError: "",
        tools,
        selectedTools: [],
      });
      res.json({ mcpClient, message: "MCP server connection tested successfully." });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/byoai/compose-suggestion", requireSession, async (req, res) => {
    try {
      const input = parseComposeSuggestionInput(req.body);
      if (!input.ok) {
        res.status(400).json({ error: input.error });
        return;
      }

      res.json({ bodyText: await generateComposeSuggestion(req.user.id, input.request) });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.put("/api/byoai/mcp-client/settings", requireSession, async (req, res) => {
    try {
      const enabled = Boolean(req.body?.enabled);
      const selectedTools = Array.isArray(req.body?.selectedTools)
        ? req.body.selectedTools.filter((name) => typeof name === "string")
        : undefined;
      const platforms = await listAiPlatforms(req.user.id);
      const settings = await getAiSettings(req.user.id);
      const mcpClient = await getMcpClientConfig(req.user.id);

      if ((enabled || selectedTools) && (!settings.aiEnabled || !platforms.some((platform) => platform.status === "connected"))) {
        res.status(400).json({ error: "Enable AI with a working AI platform before enabling MCP client tools." });
        return;
      }
      if (enabled && mcpClient.status !== "connected") {
        res.status(400).json({ error: "Save a working MCP server before enabling MCP client tools." });
        return;
      }

      const updated = await updateMcpClientSettings(req.user.id, {
        enabled,
        selectedTools: selectedTools ?? mcpClient.selectedTools,
      });
      res.json({ mcpClient: updated });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/integrations/ai/reply", requireApiKey, async (req, res) => {
    try {
      const input = parseAiEmailRequest(req.body);
      if (!input.ok) {
        res.status(400).json({ error: input.error });
        return;
      }

      const result = await generateAiReply(req.integrationUser.id, input.request);
      await logEndpointCall(req.integrationUser.id, "POST /api/integrations/ai/reply", req.body, "success", result);
      res.status(201).json(result);
    } catch (error) {
      await logEndpointCall(req.integrationUser.id, "POST /api/integrations/ai/reply", req.body, "error", getErrorPayload(error));
      handleError(res, error);
    }
  });

  app.post("/api/integrations/ai/label", requireApiKey, async (req, res) => {
    try {
      const input = parseAiEmailRequest(req.body);
      if (!input.ok) {
        res.status(400).json({ error: input.error });
        return;
      }

      const result = await generateAiLabel(req.integrationUser.id, input.request);
      await logEndpointCall(req.integrationUser.id, "POST /api/integrations/ai/label", req.body, "success", result);
      res.json(result);
    } catch (error) {
      await logEndpointCall(req.integrationUser.id, "POST /api/integrations/ai/label", req.body, "error", getErrorPayload(error));
      handleError(res, error);
    }
  });
}

async function generateAiReply(userId, request) {
  await assertAiEnabled(userId);
  const target = await findEmailTarget(userId, request);
  const bundle = await getRenderedAiPromptBundle(userId);
  const toolReference = await getSelectedMcpToolReference(userId);
  const aiResponse = await callBestAvailableAi(userId, {
    systemPrompt: appendToolReference(bundle["draft-reply"].markdown, toolReference),
    userPrompt: `Draft a reply for this email. Return JSON with keys: to, subject, bodyText, bodyHtml.\n\nSubject: ${target.email.subject}\nFrom: ${target.email.fromEmail}\nBody:\n${simplifyBody(target.email.bodyText)}`,
    responseShape: "reply",
  });
  const reply = parseJsonResponse(aiResponse, ["bodyText"]);
  const input = {
    accountEmail: target.account.email,
    emailId: target.email.emailId,
    to: String(reply.to || target.email.fromEmail || "").trim(),
    subject: String(reply.subject || `Re: ${target.email.subject || ""}`).trim(),
    bodyText: String(reply.bodyText || "").trim(),
    bodyHtml: String(reply.bodyHtml || ""),
    replyAll: false,
  };

  if (!input.bodyText && !input.bodyHtml.trim()) {
    throw badAiResponse("AI did not return a draft body.");
  }

  const accessToken = target.account.provider === "gmail" ? await getValidEmailAccountAccessToken(target.account) : null;
  const draft = await createProviderReplyDraft({ accessToken, account: target.account, input });
  await emitWebhookEvent(userId, "email.drafted", buildDraftWebhookPayload({ account: target.account, input, draft }));

  return {
    action: "draft_created",
    accountEmail: target.account.email,
    emailId: target.email.emailId,
    draftId: draft.id,
    payload: input,
  };
}

async function generateAiLabel(userId, request) {
  await assertAiEnabled(userId);
  const target = await findEmailTarget(userId, request);
  const bundle = await getRenderedAiPromptBundle(userId);
  const toolReference = await getSelectedMcpToolReference(userId);
  const aiResponse = await callBestAvailableAi(userId, {
    systemPrompt: appendToolReference(bundle["email-label"].markdown, toolReference),
    userPrompt: `Label this email. Return only valid JSON that matches this schema: {"labelsApplied":[{"labelName":"exact existing label name, ${AI_LABEL_NAME_MAX_LENGTH} characters or less","confidence":0.92,"reason":"required concise reason, ${AI_LABEL_REASON_MAX_LENGTH} characters or less"}]}. Include at most ${AI_LABEL_MAX_CANDIDATES} labelsApplied items. confidence must be a number from 0 to 1. Do not include additional properties.\n\nSubject: ${target.email.subject}\nFrom: ${target.email.fromEmail}\nBody:\n${simplifyBody(target.email.bodyText)}`,
    responseShape: "label",
  }).catch(async (error) => {
    await tryApplyUnemailableLabel(userId, {
      emailId: target.email.emailId,
      subject: target.email.subject,
      target,
      source: "ai-integration",
      reason: error.message,
    });
    throw error;
  });
  const labelResult = parseJsonResponse(aiResponse, ["labelsApplied"]);
  const labelsApplied = normalizeAiLabelCandidates(labelResult.labelsApplied);
  const payload = {
    emailId: target.email.emailId,
    threadId: target.email.threadId,
    fromEmail: target.email.fromEmail,
    fromName: target.email.fromName || target.email.fromEmail,
    subject: target.email.subject || "(no subject)",
    snippet: target.email.snippet || simplifyBody(target.email.bodyText).slice(0, 300),
    labelsApplied,
    accountEmail: target.account.email,
  };
  const parsed = await parseLabelClassificationInput(userId, payload);
  if (!parsed.ok) {
    await tryApplyUnemailableLabel(userId, {
      emailId: target.email.emailId,
      subject: target.email.subject,
      target,
      source: "ai-integration",
      reason: parsed.error,
    });
    const error = new Error(parsed.error);
    error.status = 400;
    error.labels = parsed.labels;
    throw error;
  }

  return classifyEmailWithLabelCandidates(userId, parsed.rule, { source: "ai-integration" });
}

async function generateComposeSuggestion(userId, request) {
  await assertAiEnabled(userId);
  const bundle = await getRenderedAiPromptBundle(userId);
  const toolReference = await getSelectedMcpToolReference(userId);
  const context = request.message
    ? `Original email context:\nSubject: ${request.message.subject || "(no subject)"}\nFrom: ${request.message.from || "Unknown"}\nBody:\n${simplifyBody(request.message.bodyText || request.message.snippet || "")}`
    : "This is a brand new email, not a reply. There is no original email context.";
  const aiResponse = await callBestAvailableAi(userId, {
    systemPrompt: appendToolReference(
      `${bundle["draft-reply"].markdown}\n\nReturn only the drafted email body text. Do not include explanations, markdown fences, subject lines, or metadata.`,
      toolReference,
    ),
    userPrompt: `${context}\n\nCurrent draft text:\n${request.currentBody || "(empty)"}\n\nUser instruction:\n${request.prompt}`,
    responseShape: "text",
  });

  return cleanAiTextResponse(aiResponse);
}

async function findEmailTarget(userId, request) {
  const target = await findConnectedEmailContextById(userId, request);
  if (!target) {
    const error = new Error("Email was not found in connected email accounts.");
    error.status = 404;
    throw error;
  }

  return target;
}

async function assertAiEnabled(userId) {
  const settings = await getAiSettings(userId);
  const platforms = await listAiPlatforms(userId, { includeSecret: true });
  if (!settings.aiEnabled || !platforms.some((platform) => platform.status === "connected")) {
    const error = new Error("AI is disabled. Add a working AI platform and enable AI before calling this endpoint.");
    error.status = 403;
    throw error;
  }
}

async function callBestAvailableAi(userId, prompt) {
  const platforms = await listAiPlatforms(userId, { includeSecret: true });
  const connected = platforms.filter((platform) => platform.status === "connected");
  let lastError = null;

  for (const platform of connected) {
    try {
      return await callAiPlatform(platform, prompt);
    } catch (error) {
      lastError = error;
      await logSystemEvent(userId, {
        category: "ai",
        eventName: "ai_provider.call_failed",
        status: "error",
        message: error.message,
        payload: { provider: platform.provider, model: platform.model },
      });
      console.warn(`AI provider ${platform.provider} failed:`, error.message);
    }
  }

  throw lastError ?? new Error("No working AI platform is available.");
}

async function testAiPlatform(platform) {
  await callAiPlatform(platform, {
    systemPrompt: "You are a connection test. Return only JSON.",
    userPrompt: 'Return {"ok":true}.',
    responseShape: "test",
  });
}

async function callAiPlatform(platform, { systemPrompt, userPrompt, responseShape }) {
  if (platform.provider === "openai") {
    return callOpenAi(platform, systemPrompt, userPrompt, responseShape);
  }
  if (platform.provider === "gemini") {
    return callGemini(platform, systemPrompt, userPrompt, responseShape);
  }
  if (platform.provider === "anthropic") {
    return callAnthropic(platform, systemPrompt, userPrompt);
  }
  if (platform.provider === "ollama") {
    return callOllama(platform, systemPrompt, userPrompt, responseShape);
  }
  throw new Error("Unsupported AI platform.");
}

async function callOpenAi(platform, systemPrompt, userPrompt, responseShape) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${platform.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: platform.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      ...(responseShape === "text" ? {} : { response_format: { type: "json_object" } }),
    }),
  });
  const data = await parseAiFetchResponse(response, "ChatGPT");
  return data.choices?.[0]?.message?.content ?? "";
}

async function callGemini(platform, systemPrompt, userPrompt, responseShape) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(platform.model)}:generateContent?key=${encodeURIComponent(platform.apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.2,
          ...(responseShape === "text" ? {} : { responseMimeType: "application/json" }),
        },
      }),
    },
  );
  const data = await parseAiFetchResponse(response, "Gemini");
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text).join("") ?? "";
}

async function callAnthropic(platform, systemPrompt, userPrompt) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": platform.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: platform.model,
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.2,
    }),
  });
  const data = await parseAiFetchResponse(response, "Anthropic");
  return data.content?.map((part) => part.text).join("") ?? "";
}

async function callOllama(platform, systemPrompt, userPrompt, responseShape) {
  const url = new URL("/api/chat", platform.baseUrl);
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(platform.bearerToken ? { Authorization: `Bearer ${platform.bearerToken}` } : {}),
    },
    body: JSON.stringify({
      model: platform.model,
      stream: false,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      ...(responseShape === "text" ? {} : { format: "json" }),
    }),
  });
  const data = await parseAiFetchResponse(response, "Ollama");
  return data.message?.content ?? data.response ?? "";
}

async function parseAiFetchResponse(response, providerName) {
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data.error?.message || data.error || data.message || text.slice(0, 300) || "Connection failed";
    const error = new Error(`${providerName} rejected the request: ${message}`);
    error.status = 400;
    throw error;
  }

  return data;
}

function parseJsonResponse(value, requiredKeys) {
  const text = String(value ?? "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw badAiResponse("AI returned text that was not valid JSON.");
  }

  for (const key of requiredKeys) {
    if (!(key in parsed)) {
      throw badAiResponse(`AI response is missing ${key}.`);
    }
  }

  return parsed;
}

function normalizeAiLabelCandidates(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, AI_LABEL_MAX_CANDIDATES)
    .map((candidate) => {
      const confidence = Number(candidate?.confidence);
      const labelName = truncateText(candidate?.labelName, AI_LABEL_NAME_MAX_LENGTH);
      const reason = truncateText(candidate?.reason, AI_LABEL_REASON_MAX_LENGTH) || "AI did not provide a reason.";
      return {
        labelName,
        confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
        reason,
      };
    })
    .filter((candidate) => candidate.labelName);
}

function truncateText(value, maxLength) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function badAiResponse(message) {
  const error = new Error(message);
  error.status = 502;
  return error;
}

function parseAiEmailRequest(body) {
  const emailId = typeof body?.emailId === "string" ? body.emailId.trim() : "";
  const accountEmail = typeof body?.accountEmail === "string" ? body.accountEmail.trim().toLowerCase() : "";
  if (!emailId) {
    return { ok: false, error: "emailId is required" };
  }

  return { ok: true, request: { emailId, accountEmail } };
}

function parseComposeSuggestionInput(body) {
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const currentBody = typeof body?.currentBody === "string" ? body.currentBody : "";
  const message = body?.message && typeof body.message === "object" && !Array.isArray(body.message)
    ? {
        subject: typeof body.message.subject === "string" ? body.message.subject : "",
        from: typeof body.message.from === "string" ? body.message.from : "",
        snippet: typeof body.message.snippet === "string" ? body.message.snippet : "",
        bodyText: typeof body.message.bodyText === "string" ? body.message.bodyText : "",
      }
    : null;

  if (!prompt) {
    return { ok: false, error: "Tell the AI how to draft the email." };
  }
  if (prompt.length > 1000) {
    return { ok: false, error: "AI composer prompt must be 1,000 characters or less." };
  }
  if (currentBody.length > 20_000) {
    return { ok: false, error: "Current draft is too long for AI composer." };
  }

  return { ok: true, request: { prompt, currentBody, message } };
}

function parsePlatformInput(body) {
  const provider = typeof body?.provider === "string" ? body.provider : "";
  const definition = PROVIDER_DEFINITIONS[provider];
  const model = typeof body?.model === "string" ? body.model.trim() : "";
  const apiKey = readClientSecret(body, "apiKey");
  const baseUrl = typeof body?.baseUrl === "string" ? body.baseUrl.trim() : "";
  const bearerToken = readClientSecret(body, "bearerToken");

  if (!definition) {
    return { ok: false, error: "Choose a supported AI platform." };
  }
  if (!model) {
    return { ok: false, error: "Model is required." };
  }
  if (provider === "ollama") {
    if (!baseUrl) {
      return { ok: false, error: "Ollama URL is required." };
    }
    try {
      const parsed = new URL(baseUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return { ok: false, error: "Ollama URL must use http or https." };
      }
    } catch {
      return { ok: false, error: "Ollama URL must be a valid URL." };
    }
  } else if (!apiKey) {
    return { ok: false, error: `${definition.label} API key is required.` };
  }

  return { ok: true, platform: { provider, model, apiKey, baseUrl, bearerToken } };
}

function parseMcpClientInput(body) {
  const serverUrl = typeof body?.serverUrl === "string" ? body.serverUrl.trim() : "";
  const bearerToken = readClientSecret(body, "bearerToken");

  if (!serverUrl) {
    return { ok: false, error: "MCP server URL is required." };
  }

  try {
    const parsed = new URL(serverUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { ok: false, error: "MCP server URL must use http or https." };
    }
  } catch {
    return { ok: false, error: "MCP server URL must be a valid URL." };
  }

  return { ok: true, config: { serverUrl, bearerToken } };
}

function readClientSecret(body, key) {
  const encryptedKey = `encrypted${key[0].toUpperCase()}${key.slice(1)}`;
  if (typeof body?.[encryptedKey] === "string" && body[encryptedKey]) {
    return decryptClientSecret(body[encryptedKey]).trim();
  }

  return typeof body?.[key] === "string" ? body[key].trim() : "";
}

async function getAiSettings(userId) {
  const result = await dbPool.query(
    `
      insert into user_settings (user_id, confidence_threshold)
      values ($1, 0.9)
      on conflict (user_id) do nothing
      returning ai_enabled as "aiEnabled"
    `,
    [userId],
  );
  if (result.rows[0]) {
    return { aiEnabled: Boolean(result.rows[0].aiEnabled) };
  }

  const existing = await dbPool.query(`select ai_enabled as "aiEnabled" from user_settings where user_id = $1`, [userId]);
  return { aiEnabled: Boolean(existing.rows[0]?.aiEnabled) };
}

async function updateAiEnabled(userId, enabled) {
  const result = await dbPool.query(
    `
      insert into user_settings (user_id, confidence_threshold, ai_enabled)
      values ($1, 0.9, $2)
      on conflict (user_id) do update
      set ai_enabled = excluded.ai_enabled
      returning ai_enabled as "aiEnabled"
    `,
    [userId, enabled],
  );
  return { aiEnabled: Boolean(result.rows[0]?.aiEnabled) };
}

async function getAiPlatformCount(userId) {
  const result = await dbPool.query("select count(*)::int as count from ai_platforms where user_id = $1", [userId]);
  return result.rows[0]?.count ?? 0;
}

async function listAiPlatforms(userId, { includeSecret = false } = {}) {
  const result = await dbPool.query(
    `
      select id, provider, model, encrypted_api_key as "encryptedApiKey", base_url as "baseUrl",
             encrypted_bearer_token as "encryptedBearerToken", sort_order as "sortOrder",
             status, last_error as "lastError", created_at as "createdAt", updated_at as "updatedAt"
      from ai_platforms
      where user_id = $1
      order by sort_order asc, created_at asc
    `,
    [userId],
  );

  return result.rows.map((row, index) => ({
    id: row.id,
    provider: row.provider,
    providerLabel: PROVIDER_DEFINITIONS[row.provider]?.label ?? row.provider,
    model: row.model,
    baseUrl: row.baseUrl ?? "",
    sortOrder: index,
    status: row.status,
    lastError: row.lastError ?? "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    hasApiKey: Boolean(row.encryptedApiKey),
    hasBearerToken: Boolean(row.encryptedBearerToken),
    ...(includeSecret
      ? {
          apiKey: row.encryptedApiKey ? decryptSecret(row.encryptedApiKey) : "",
          bearerToken: row.encryptedBearerToken ? decryptSecret(row.encryptedBearerToken) : "",
        }
      : {}),
  }));
}

async function createAiPlatform(userId, platform) {
  const count = await getAiPlatformCount(userId);
  const result = await dbPool.query(
    `
      insert into ai_platforms (id, user_id, provider, model, encrypted_api_key, base_url, encrypted_bearer_token, sort_order, status, last_error)
      values ($1, $2, $3, $4, $5, $6, $7, $8, 'connected', null)
      returning id
    `,
    [
      crypto.randomUUID(),
      userId,
      platform.provider,
      platform.model,
      platform.apiKey ? encryptSecret(platform.apiKey) : null,
      platform.baseUrl || null,
      platform.bearerToken ? encryptSecret(platform.bearerToken) : null,
      count,
    ],
  );
  return (await listAiPlatforms(userId)).find((entry) => entry.id === result.rows[0].id);
}

async function updateAiPlatform(userId, id, platform) {
  const result = await dbPool.query(
    `
      update ai_platforms
      set provider = $3,
          model = $4,
          encrypted_api_key = $5,
          base_url = $6,
          encrypted_bearer_token = $7,
          status = 'connected',
          last_error = null,
          updated_at = now()
      where user_id = $1 and id = $2
      returning id
    `,
    [
      userId,
      id,
      platform.provider,
      platform.model,
      platform.apiKey ? encryptSecret(platform.apiKey) : null,
      platform.baseUrl || null,
      platform.bearerToken ? encryptSecret(platform.bearerToken) : null,
    ],
  );
  return result.rows[0] ? (await listAiPlatforms(userId)).find((entry) => entry.id === result.rows[0].id) : null;
}

async function reorderAiPlatforms(userId, ids) {
  for (const [index, id] of ids.entries()) {
    await dbPool.query("update ai_platforms set sort_order = $3, updated_at = now() where user_id = $1 and id = $2", [userId, id, index]);
  }
}

async function normalizePlatformOrder(userId) {
  const platforms = await listAiPlatforms(userId);
  await reorderAiPlatforms(userId, platforms.map((platform) => platform.id));
  return listAiPlatforms(userId);
}

async function getMcpClientConfig(userId, { includeSecret = false } = {}) {
  const result = await dbPool.query(
    `
      select server_url as "serverUrl", encrypted_bearer_token as "encryptedBearerToken",
             enabled, status, last_error as "lastError", tools, selected_tools as "selectedTools",
             updated_at as "updatedAt"
      from ai_mcp_clients
      where user_id = $1
    `,
    [userId],
  );
  const row = result.rows[0];
  if (!row) {
    return {
      serverUrl: "",
      enabled: false,
      status: "untested",
      lastError: "",
      tools: [],
      selectedTools: [],
      hasBearerToken: false,
    };
  }

  return {
    serverUrl: row.serverUrl ?? "",
    enabled: Boolean(row.enabled),
    status: row.status ?? "untested",
    lastError: row.lastError ?? "",
    tools: Array.isArray(row.tools) ? row.tools : [],
    selectedTools: Array.isArray(row.selectedTools) ? row.selectedTools : [],
    hasBearerToken: Boolean(row.encryptedBearerToken),
    updatedAt: row.updatedAt,
    ...(includeSecret ? { bearerToken: row.encryptedBearerToken ? decryptSecret(row.encryptedBearerToken) : "" } : {}),
  };
}

async function saveMcpClientConfig(userId, config) {
  const result = await dbPool.query(
    `
      insert into ai_mcp_clients (user_id, server_url, encrypted_bearer_token, enabled, status, last_error, tools, selected_tools)
      values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
      on conflict (user_id) do update
      set server_url = excluded.server_url,
          encrypted_bearer_token = excluded.encrypted_bearer_token,
          enabled = excluded.enabled,
          status = excluded.status,
          last_error = excluded.last_error,
          tools = excluded.tools,
          selected_tools = excluded.selected_tools,
          updated_at = now()
      returning user_id
    `,
    [
      userId,
      config.serverUrl,
      config.bearerToken ? encryptSecret(config.bearerToken) : null,
      Boolean(config.enabled),
      config.status,
      config.lastError || null,
      JSON.stringify(config.tools ?? []),
      JSON.stringify(config.selectedTools ?? []),
    ],
  );

  return result.rows[0] ? getMcpClientConfig(userId) : null;
}

async function updateMcpClientSettings(userId, { enabled, selectedTools }) {
  const existing = await getMcpClientConfig(userId);
  const validToolNames = new Set(existing.tools.map((tool) => tool.name));
  const normalizedSelectedTools = (selectedTools ?? []).filter((name) => validToolNames.has(name));
  await dbPool.query(
    `
      update ai_mcp_clients
      set enabled = $2,
          selected_tools = $3::jsonb,
          updated_at = now()
      where user_id = $1
    `,
    [userId, Boolean(enabled), JSON.stringify(normalizedSelectedTools)],
  );
  return getMcpClientConfig(userId);
}

async function fetchMcpServerTools(config) {
  const response = await fetch(config.serverUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(config.bearerToken ? { Authorization: `Bearer ${config.bearerToken}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/list",
      params: {},
    }),
  });
  const data = await parseMcpResponse(response);
  const tools = data.result?.tools ?? data.tools ?? [];
  if (!Array.isArray(tools)) {
    const error = new Error("MCP server did not return a tools list.");
    error.status = 400;
    throw error;
  }

  return tools.map((tool) => ({
    name: String(tool.name ?? "").trim(),
    description: String(tool.description ?? ""),
    inputSchema: tool.inputSchema ?? tool.input_schema ?? null,
  })).filter((tool) => tool.name);
}

async function parseMcpResponse(response) {
  const text = await response.text();
  const jsonText = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => line.startsWith("{") || line.startsWith("data:"));
  const payload = jsonText?.startsWith("data:") ? jsonText.slice(5).trim() : jsonText || text;
  let data = {};
  try {
    data = payload ? JSON.parse(payload) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok || data.error) {
    const message = data.error?.message || data.message || text.slice(0, 300) || "MCP server connection failed.";
    const error = new Error(`MCP server rejected the request: ${message}`);
    error.status = 400;
    throw error;
  }

  return data;
}

async function getSelectedMcpToolReference(userId) {
  const client = await getMcpClientConfig(userId);
  if (!client.enabled || client.status !== "connected" || client.selectedTools.length === 0) {
    return "";
  }

  const selected = new Set(client.selectedTools);
  const tools = client.tools.filter((tool) => selected.has(tool.name));
  if (tools.length === 0) {
    return "";
  }

  return tools.map((tool) => `- ${tool.name}: ${tool.description || "No description provided."}`).join("\n");
}

function appendToolReference(systemPrompt, toolReference) {
  if (!toolReference) {
    return systemPrompt;
  }

  return `${systemPrompt}\n\nAvailable MCP tools for context only:\n${toolReference}\n\nOnly reference these tools when they are relevant.`;
}

function cleanAiTextResponse(value) {
  const text = String(value ?? "").trim();
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed.bodyText === "string") {
      return parsed.bodyText.trim();
    }
    if (typeof parsed.reply === "string") {
      return parsed.reply.trim();
    }
    if (typeof parsed.message === "string") {
      return parsed.message.trim();
    }
  } catch {
    // Plain text is the expected response for the composer.
  }

  return text.replace(/^```(?:text|markdown)?\s*/i, "").replace(/```$/i, "").trim();
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

function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash("sha256").update(SECRET).digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptSecret(value) {
  const [ivText, tagText, encryptedText] = String(value).split(".");
  const key = crypto.createHash("sha256").update(SECRET).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
}

function decryptClientSecret(value) {
  try {
    return crypto.privateDecrypt(
      {
        key: clientEncryptionKeyPair.privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(value, "base64"),
    ).toString("utf8");
  } catch {
    const error = new Error("Encrypted secret could not be read. Refresh the page and try again.");
    error.status = 400;
    throw error;
  }
}

function simplifyBody(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 8000);
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

function handleError(res, error) {
  console.error("BYOAI request failed:", error);
  res.status(error.status || 500).json(getErrorPayload(error));
}

function getErrorPayload(error) {
  return {
    error: error.message || "BYOAI request failed.",
    ...(Array.isArray(error.lookupFailures) ? { lookupFailures: error.lookupFailures } : {}),
  };
}
