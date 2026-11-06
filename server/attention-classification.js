export const QUICK_WIN_CONFIDENCE_THRESHOLD = 0.72;

export const INTEREST_FRESHNESS_THRESHOLDS = Object.freeze({
  freshMaxDays: 7,
  coolingMaxDays: 21,
  reviewMaxDays: 45,
});

const QUICK_ACTION_PATTERNS = Object.freeze({
  confirmation: /\b(confirm|confirmation|approve|approval|acknowledge|rsvp|yes or no)\b/i,
  coordination: /\b(schedule|scheduling|availability|available|meeting time|reschedule|calendar invite)\b/i,
  shortReply: /\b(quick question|can you (?:confirm|send|share|reply)|please (?:confirm|reply|review briefly))\b/i,
  administrative: /\b(sign in|reset password|verify|complete the form|update your details)\b/i,
});

const COMPLEX_WORK_PATTERN = /\b(research|investigate|proposal|strategy|analysis|analy[sz]e|project plan|presentation|report|implementation|migration|legal review|tax return|audit)\b/i;
const EXTERNAL_WORK_PATTERN = /\b(call|phone|visit|pick up|drop off|print|mail|ship|install|repair|measure|photograph)\b/i;
const PROTECTED_PATTERN = /\b(security|fraud|breach|compromis|deadline|urgent|past due|overdue)\b/i;

export function deriveQuickWinMetadata(message = {}, existing = {}) {
  if (typeof existing?.isQuickWin === "boolean" && Number.isFinite(Number(existing?.quickWinConfidence))) {
    return normalizeQuickWinMetadata(existing);
  }

  const content = `${message.subject || ""} ${message.snippet || ""} ${(message.labels || []).join(" ")}`.trim();
  const matches = Object.entries(QUICK_ACTION_PATTERNS).filter(([, pattern]) => pattern.test(content));
  const complex = COMPLEX_WORK_PATTERN.test(content);
  const requiresExternalWork = EXTERNAL_WORK_PATTERN.test(content);
  const protectedMessage = PROTECTED_PATTERN.test(content);
  let confidence = matches.length > 0 ? 0.76 + Math.min(0.12, (matches.length - 1) * 0.06) : 0.2;
  if (complex) confidence -= 0.45;
  if (requiresExternalWork) confidence -= 0.18;
  if (protectedMessage) confidence -= 0.12;
  confidence = Math.max(0, Math.min(0.99, Number(confidence.toFixed(2))));

  const actionType = matches[0]?.[0] || "unknown";
  return {
    actionType,
    isQuickWin: confidence >= QUICK_WIN_CONFIDENCE_THRESHOLD && !complex,
    quickWinConfidence: confidence,
    requiredCapabilities: actionType === "coordination" ? ["calendar"] : actionType === "shortReply" || actionType === "confirmation" ? ["email_reply"] : [],
    requiresExternalWork,
    suggestedNextAction: suggestedAction(actionType, message.subject),
  };
}

export function getInterestFreshness(lastMeaningfulAt, now = new Date()) {
  const lastMeaningful = new Date(lastMeaningfulAt || now);
  const validLastMeaningful = Number.isNaN(lastMeaningful.getTime()) ? now : lastMeaningful;
  const days = Math.max(0, Math.floor((now.getTime() - validLastMeaningful.getTime()) / 86_400_000));
  if (days <= INTEREST_FRESHNESS_THRESHOLDS.freshMaxDays) return { days, label: days === 0 ? "Recently saved" : `Saved ${days} day${days === 1 ? "" : "s"} ago`, state: "fresh" };
  if (days <= INTEREST_FRESHNESS_THRESHOLDS.coolingMaxDays) return { days, label: `Saved ${days} days ago`, state: "cooling" };
  if (days <= INTEREST_FRESHNESS_THRESHOLDS.reviewMaxDays) return { days, label: "Still interested?", state: "review" };
  return { days, label: "Review or clear", state: "stale" };
}

function normalizeQuickWinMetadata(metadata) {
  const confidence = Math.max(0, Math.min(1, Number(metadata.quickWinConfidence) || 0));
  return {
    actionType: String(metadata.actionType || "unknown"),
    isQuickWin: Boolean(metadata.isQuickWin) && confidence >= QUICK_WIN_CONFIDENCE_THRESHOLD,
    quickWinConfidence: confidence,
    requiredCapabilities: Array.isArray(metadata.requiredCapabilities) ? metadata.requiredCapabilities.map(String) : [],
    requiresExternalWork: Boolean(metadata.requiresExternalWork),
    suggestedNextAction: String(metadata.suggestedNextAction || "").trim(),
  };
}

function suggestedAction(actionType, subject) {
  if (actionType === "confirmation") return "Confirm or respond to this request.";
  if (actionType === "coordination") return "Review availability and respond.";
  if (actionType === "shortReply") return "Send a concise reply.";
  if (actionType === "administrative") return "Complete the requested administrative step.";
  return subject ? `Review ${String(subject).trim()}.` : "Review and decide the next action.";
}
