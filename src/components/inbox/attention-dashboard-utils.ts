import type { AttentionMessage } from "./attention-dashboard-types";

export function attentionMessageKey(message: AttentionMessage) {
  return `${message.accountId}:${message.mailbox || ""}:${message.id}`;
}

export function attentionSenderInitial(message: AttentionMessage) {
  return (message.sender || message.from || "?").trim().charAt(0).toUpperCase();
}

export function formatAttentionDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function hasActiveCommitment(message: AttentionMessage) {
  return Boolean(message.commitment && !message.commitment.isCompleted && !message.commitment.completedAt);
}
