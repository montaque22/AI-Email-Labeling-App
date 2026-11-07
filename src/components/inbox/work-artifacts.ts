export type ReplyDraftVersion = {
  bodyText: string;
  createdAt: string;
  subject: string;
  to: string;
  version: number;
};

export type ReplyDraftArtifact = {
  accountId: string;
  activeVersionIndex: number;
  createdAt: string;
  emailId: string;
  id: string;
  status: "ready" | "applied" | "superseded" | "failed";
  threadId: string;
  type: "email_draft";
  updatedAt: string;
  versions: ReplyDraftVersion[];
};

export type PreparedReplyDraft = {
  accountId: string;
  bodyText: string;
  emailId: string;
  subject: string;
  threadId: string;
  to: string;
  type: "email_draft";
};

export type ReplyComposerFields = {
  accountId: string;
  bodyText: string;
  subject: string;
  threadId: string;
  to: string;
};

export function isPreparedReplyDraft(value: unknown): value is PreparedReplyDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PreparedReplyDraft>;
  return candidate.type === "email_draft"
    && typeof candidate.accountId === "string"
    && typeof candidate.emailId === "string"
    && typeof candidate.threadId === "string"
    && typeof candidate.to === "string"
    && typeof candidate.subject === "string"
    && typeof candidate.bodyText === "string"
    && candidate.bodyText.trim().length > 0;
}

export function isReplyDraftArtifact(value: unknown): value is ReplyDraftArtifact {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ReplyDraftArtifact>;
  return candidate.type === "email_draft"
    && typeof candidate.id === "string"
    && typeof candidate.accountId === "string"
    && typeof candidate.emailId === "string"
    && typeof candidate.threadId === "string"
    && typeof candidate.activeVersionIndex === "number"
    && Array.isArray(candidate.versions)
    && candidate.versions.length > 0
    && candidate.versions.every((version) => typeof version?.bodyText === "string" && typeof version?.version === "number");
}

export function createReplyDraftArtifact(
  prepared: PreparedReplyDraft,
  existing?: ReplyDraftArtifact,
  now = new Date().toISOString(),
): ReplyDraftArtifact {
  const nextVersion: ReplyDraftVersion = {
    bodyText: prepared.bodyText.trim(),
    createdAt: now,
    subject: prepared.subject.trim(),
    to: prepared.to.trim(),
    version: (existing?.versions[existing.versions.length - 1]?.version ?? 0) + 1,
  };
  const versions = existing ? [...existing.versions, nextVersion] : [nextVersion];
  return {
    accountId: prepared.accountId,
    activeVersionIndex: versions.length - 1,
    createdAt: existing?.createdAt ?? now,
    emailId: prepared.emailId,
    id: existing?.id ?? globalThis.crypto?.randomUUID?.() ?? `draft-${Date.now()}`,
    status: "ready",
    threadId: prepared.threadId,
    type: "email_draft",
    updatedAt: now,
    versions,
  };
}

export function getActiveReplyDraftVersion(artifact: ReplyDraftArtifact): ReplyDraftVersion {
  return artifact.versions[Math.max(0, Math.min(artifact.activeVersionIndex, artifact.versions.length - 1))];
}

export function restorePreviousReplyDraftVersion(artifact: ReplyDraftArtifact): ReplyDraftArtifact {
  return {
    ...artifact,
    activeVersionIndex: Math.max(0, artifact.activeVersionIndex - 1),
    status: "ready",
    updatedAt: new Date().toISOString(),
  };
}

export function formatReplyDraftForAgent(artifact: ReplyDraftArtifact): string {
  const version = getActiveReplyDraftVersion(artifact);
  return [
    "Current reply draft artifact:",
    `artifactId: ${artifact.id}`,
    `accountId: ${artifact.accountId}`,
    `emailId: ${artifact.emailId}`,
    `threadId: ${artifact.threadId}`,
    `to: ${version.to}`,
    `subject: ${version.subject}`,
    "bodyText:",
    version.bodyText,
  ].join("\n");
}

export function buildReplyComposerFields(
  artifact: ReplyDraftArtifact,
  fallback: Partial<ReplyComposerFields> = {},
): ReplyComposerFields {
  const version = getActiveReplyDraftVersion(artifact);
  return {
    accountId: artifact.accountId || fallback.accountId || "",
    bodyText: version.bodyText,
    subject: version.subject || fallback.subject || "",
    threadId: artifact.threadId || fallback.threadId || "",
    to: version.to || fallback.to || "",
  };
}
