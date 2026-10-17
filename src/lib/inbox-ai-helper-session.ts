export const INBOX_AI_HELPER_SESSION_KEY = "emailable.inbox.aiHelper.history";
export const INBOX_AI_HELPER_SESSION_ID_KEY = "emailable.inbox.aiHelper.sessionId";
export const INBOX_AI_HELPER_SESSION_CREATED_KEY = "emailable.inbox.aiHelper.createdAt";
export const INBOX_AI_HELPER_SESSION_TTL_MS = 60 * 60 * 1000;
export const INBOX_AI_HELPER_HISTORY_LIMIT = 60;

type SessionResetOptions = {
  createId?: () => string;
  now?: () => number;
};

function createSessionId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function resetInboxAiHelperSession(
  storage: Pick<Storage, "removeItem" | "setItem">,
  options: SessionResetOptions = {},
) {
  const sessionId = (options.createId ?? createSessionId)();
  const createdAt = (options.now ?? Date.now)();

  storage.removeItem(INBOX_AI_HELPER_SESSION_KEY);
  storage.setItem(INBOX_AI_HELPER_SESSION_ID_KEY, sessionId);
  storage.setItem(INBOX_AI_HELPER_SESSION_CREATED_KEY, String(createdAt));

  return sessionId;
}
