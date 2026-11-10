import { getAttentionDashboard } from "./attention-dashboard.js";
import { dbPool } from "./db.js";
import { getConnectedEmailAccounts } from "./email-accounts.js";
import { findConnectedEmailContextById } from "./integrations.js";

export const EMAILABLE_CAPABILITY_MANIFEST_VERSION = "2026-11-09.1";

export const ATTENTION_DASHBOARD_CATEGORIES = Object.freeze([
  "needs_attention",
  "of_interest",
  "quick_cleanup",
  "likely_clutter",
  "cleanup_review",
  "quick_wins",
  "commitments",
]);

export const APPLICATION_MCP_TOOL_DEFINITIONS = Object.freeze([
  {
    name: "get_application_context",
    title: "Get Application Context",
    description: "Discover the signed-in user's authorized Emailable accounts, labels, persistent application concepts, and currently registered internal data tools. Use when application terminology or available resources need clarification.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "query_attention_dashboard",
    title: "Query Attention Dashboard",
    description: "Count or list authoritative Emailable dashboard categories using the same persistent placement logic as the UI. Of Interest, Needs Attention, Quick Cleanup, Quick Wins, Commitments, Likely Clutter, and Needs Review are application concepts, not ordinary labels.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", enum: ATTENTION_DASHBOARD_CATEGORIES },
        operation: { type: "string", enum: ["count", "list"] },
        accountIds: { type: "array", maxItems: 50, items: { type: "string" } },
        limit: { type: "number", minimum: 1, maximum: 100 },
        offset: { type: "number", minimum: 0 },
      },
      required: ["category"],
      additionalProperties: false,
    },
  },
  {
    name: "get_email_content",
    title: "Get Email Content",
    description: "Retrieve the complete content of a specific message from the authorized connected account that owns it. Use after a database or dashboard lookup when an indexed snippet is insufficient.",
    inputSchema: {
      type: "object",
      properties: {
        accountId: { type: "string" },
        emailId: { type: "string" },
        subject: { type: "string" },
        maxCharacters: { type: "number", minimum: 1000, maximum: 30000 },
      },
      required: ["accountId", "emailId"],
      additionalProperties: false,
    },
  },
]);

const APPLICATION_CONCEPTS = Object.freeze([
  { key: "needs_attention", name: "Needs Attention", description: "Inbox messages Emailable currently identifies as requiring action or review." },
  { key: "of_interest", name: "Of Interest", description: "Messages the user bookmarked or repeatedly engaged with for later consideration." },
  { key: "quick_cleanup", name: "Quick Cleanup", description: "Lower-priority inbox messages, including Likely Clutter and Needs Review." },
  { key: "quick_wins", name: "Quick Wins", description: "A subset of Needs Attention that Emailable predicts can be resolved quickly." },
  { key: "commitments", name: "Commitments", description: "Active follow-up commitments linked to messages in Needs Attention." },
]);

const APPLICATION_TOOL_NAMES = new Set([
  "get_application_context",
  "query_attention_dashboard",
  "get_email_content",
  "find_email",
  "query_email_rules",
  "listTasks",
  "searchTasks",
]);

export async function getApplicationCapabilityContext(userId, toolCatalog = []) {
  const [accounts, labels] = await Promise.all([
    getConnectedEmailAccounts(userId),
    dbPool.query("select name, description from labels where user_id = $1 order by lower(name)", [userId]),
  ]);
  return buildApplicationCapabilityManifest({ accounts, labels: labels.rows, toolCatalog });
}

export function buildApplicationCapabilityManifest({ accounts = [], labels = [], toolCatalog = [] } = {}) {
  const availableTools = toolCatalog
    .filter((tool) => APPLICATION_TOOL_NAMES.has(tool?.name))
    .map((tool) => ({ name: tool.name, source: tool.source || "emailable" }));
  return {
    version: EMAILABLE_CAPABILITY_MANIFEST_VERSION,
    concepts: APPLICATION_CONCEPTS,
    persistentApplicationState: {
      accountCount: accounts.length,
      accounts: accounts.map((account) => ({ id: account.id, email: account.email, provider: account.provider })),
      labels: labels.map((label) => ({
        name: String(label.name || ""),
        description: String(label.description || "") || "No description provided.",
      })),
    },
    availableInternalTools: availableTools,
  };
}

export async function queryAttentionDashboardForAgent(userId, input = {}) {
  const accountIds = normalizeStringArray(input.accountIds, 50);
  await assertAuthorizedAccounts(userId, accountIds);
  const dashboard = await getAttentionDashboard(userId, {
    accountIds,
    includeAllPriorityMessages: true,
  });
  return selectAttentionDashboardResource(dashboard, {
    category: input.category,
    operation: input.operation,
    limit: input.limit,
    offset: input.offset,
    accountIds,
  });
}

export function selectAttentionDashboardResource(dashboard, input = {}) {
  const category = normalizeCategory(input.category);
  const operation = input.operation === "list" ? "list" : "count";
  const offset = Math.max(0, Number.isInteger(input.offset) ? input.offset : 0);
  const limit = Math.min(100, Math.max(1, Number.isInteger(input.limit) ? input.limit : 25));
  const resources = {
    needs_attention: dashboard.categories?.attention ?? [],
    of_interest: dashboard.categories?.interest ?? [],
    quick_cleanup: [...(dashboard.categories?.cleanup ?? []), ...(dashboard.cleanupReview ?? [])],
    likely_clutter: dashboard.categories?.cleanup ?? [],
    cleanup_review: dashboard.cleanupReview ?? [],
    quick_wins: dashboard.quickWins ?? [],
    commitments: dashboard.commitments ?? [],
  };
  const messages = resources[category];
  const totalMatches = messages.length;
  const results = operation === "list"
    ? messages.slice(offset, offset + limit).map(summarizeDashboardMessage)
    : [];
  const nextOffset = operation === "list" && offset + results.length < totalMatches
    ? offset + results.length
    : null;
  return {
    source: "attention_dashboard",
    policyVersion: dashboard.categories?.attention?.[0]?.attention?.policyVersion ?? null,
    category,
    categoryName: APPLICATION_CONCEPTS.find((concept) => concept.key === category)?.name
      ?? (category === "likely_clutter" ? "Likely Clutter" : "Needs Review"),
    operation,
    scope: { accountIds: input.accountIds ?? [], mailbox: "inbox", excludesTrash: true },
    totalMatches,
    returned: results.length,
    nextOffset,
    results,
    dashboardCounts: {
      needsAttention: dashboard.counts?.attention ?? 0,
      ofInterest: dashboard.counts?.interest ?? 0,
      quickCleanup: dashboard.counts?.cleanup ?? 0,
      quickWins: dashboard.quickWinCount ?? 0,
      commitments: dashboard.commitments?.length ?? 0,
      likelyClutter: dashboard.cleanupCounts?.likelyClutter ?? 0,
      needsReview: dashboard.cleanupCounts?.needsReview ?? 0,
    },
  };
}

export async function getEmailContentForAgent(userId, input = {}) {
  const accountId = String(input.accountId || "").trim();
  const emailId = String(input.emailId || "").trim();
  if (!accountId || !emailId) throw createInputError("accountId and emailId are required.");
  const [account] = await assertAuthorizedAccounts(userId, [accountId]);
  const match = await findConnectedEmailContextById(userId, {
    accountEmail: account.email,
    emailId,
    subject: String(input.subject || "").trim(),
  });
  const email = match.email;
  const maxCharacters = Math.min(30_000, Math.max(1_000, Number(input.maxCharacters) || 20_000));
  const bodyText = String(email.bodyText || "");
  return {
    source: "connected_email_account",
    account: { id: account.id, email: account.email, provider: account.provider },
    email: {
      emailId: email.emailId,
      threadId: email.threadId,
      fromEmail: email.fromEmail,
      fromName: email.fromName,
      to: email.to,
      subject: email.subject,
      receivedAt: email.receivedAt,
      bodyText: bodyText.slice(0, maxCharacters),
      contentLength: bodyText.length,
      contentTruncated: bodyText.length > maxCharacters,
      hasAttachments: Boolean(email.hasAttachments),
    },
  };
}

async function assertAuthorizedAccounts(userId, accountIds) {
  const accounts = await getConnectedEmailAccounts(userId);
  if (accountIds.length === 0) return accounts;
  const requested = new Set(accountIds);
  const authorized = accounts.filter((account) => requested.has(account.id));
  if (authorized.length !== requested.size) {
    const error = new Error("One or more requested email accounts are not available to the signed-in user.");
    error.status = 403;
    throw error;
  }
  return authorized;
}

function normalizeCategory(value) {
  const category = String(value || "").trim().toLowerCase();
  const aliases = {
    attention: "needs_attention",
    interest: "of_interest",
    cleanup: "quick_cleanup",
    review: "cleanup_review",
    commitment: "commitments",
    quick_win: "quick_wins",
  };
  const normalized = aliases[category] || category;
  if (!ATTENTION_DASHBOARD_CATEGORIES.includes(normalized)) throw createInputError("A supported Emailable dashboard category is required.");
  return normalized;
}

function normalizeStringArray(value, limit) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim()).slice(0, limit).map((item) => item.trim())
    : [];
}

function summarizeDashboardMessage(message) {
  return {
    accountId: message.accountId,
    accountEmail: message.accountEmail,
    emailId: message.id,
    threadId: message.threadId,
    from: message.from || message.sender,
    subject: message.subject,
    snippet: message.snippet,
    date: message.date,
    labels: message.labels,
    explanation: message.attention?.explanation || "",
    reasonCode: message.attention?.reasonCode || "",
    commitment: message.commitment || null,
    interestFreshness: message.interestFreshness || null,
  };
}

function createInputError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}
