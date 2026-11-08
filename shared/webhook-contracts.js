import { z } from "zod";

export const WEBHOOK_SCHEMA_VERSION = "1.0";
export const ACTIVITY_CALLBACK_STATUSES = ["completed", "failed"];
export const ACTIVITY_CALLBACK_LIMITS = {
  eventId: 200,
  activityId: 200,
  source: 100,
  title: 200,
  description: 2000,
  dataBytes: 32_768,
  errorBytes: 16_384,
};

const jsonRecord = z.record(z.string(), z.unknown());

export const activityCallbackSchema = z.object({
  schema_version: z.literal(WEBHOOK_SCHEMA_VERSION),
  event_id: z.string().trim().min(1).max(ACTIVITY_CALLBACK_LIMITS.eventId),
  activity_id: z.string().trim().min(1).max(ACTIVITY_CALLBACK_LIMITS.activityId),
  status: z.enum(ACTIVITY_CALLBACK_STATUSES),
  source: z.string().trim().min(1).max(ACTIVITY_CALLBACK_LIMITS.source),
  title: z.string().trim().min(1).max(ACTIVITY_CALLBACK_LIMITS.title),
  description: z.string().trim().max(ACTIVITY_CALLBACK_LIMITS.description),
  timestamp: z.iso.datetime({ offset: true }),
  data: jsonRecord,
  error: jsonRecord.optional(),
}).strict().superRefine((value, context) => {
  if (value.status !== "failed" && value.error !== undefined) {
    context.addIssue({ code: "custom", path: ["error"], message: "error is only valid when status is failed" });
  }
  if (jsonByteLength(value.data) > ACTIVITY_CALLBACK_LIMITS.dataBytes) {
    context.addIssue({ code: "custom", path: ["data"], message: "data exceeds the 32768 byte limit" });
  }
  if (value.error && jsonByteLength(value.error) > ACTIVITY_CALLBACK_LIMITS.errorBytes) {
    context.addIssue({ code: "custom", path: ["error"], message: "error exceeds the 16384 byte limit" });
  }
});

export const ACTIVITY_CALLBACK_EXAMPLES = {
  completed: {
    schema_version: WEBHOOK_SCHEMA_VERSION,
    event_id: "evt_123",
    activity_id: "activity_456",
    status: "completed",
    source: "n8n",
    title: "Document created",
    description: "Summary saved to the project folder.",
    timestamp: "2026-11-07T18:14:05Z",
    data: { document_id: "doc_123", url: "https://example.com/documents/doc_123" },
  },
  failed: {
    schema_version: WEBHOOK_SCHEMA_VERSION,
    event_id: "evt_123",
    activity_id: "activity_456",
    status: "failed",
    source: "n8n",
    title: "Document creation failed",
    description: "The external workflow could not create the document.",
    timestamp: "2026-11-07T18:14:05Z",
    data: { workflow_run_id: "run_789" },
    error: { code: "AUTH_EXPIRED", message: "Authentication expired" },
  },
};

export const WEBHOOK_EVENT_DEFINITIONS = [
  event("email.ready_for_processing", "Email ready for processing", "An email is fully processed, labeled, and ready for external automation.", { email: { id: "message-id", subject: "Quarterly planning", attachments: [{ filename: "plan.pdf", available: false, unavailable_reason: "Attachment content was not loaded during processing." }] }, classification: { labels: [{ id: "label-id", name: "Action Required", description: "Requires review or action." }], attention: null }, activity_callback: { url: "https://emailable.example/api/v1/activity-callbacks/secret", schema_version: WEBHOOK_SCHEMA_VERSION } }, "Start post-processing and report visible activity back to Emailable."),
  event("email.received", "Email received", "Polling found messages eligible for processing.", { accountEmail: "user@example.com", messages: [{ emailId: "message-id", subject: "Quarterly planning", from: "sender@example.com" }] }, "Queue downstream processing for newly fetched mail."),
  event("email.drafted", "Email drafted", "Emailable created an email draft.", { accountEmail: "user@example.com", emailId: "message-id", draftId: "draft-id", to: ["recipient@example.com"], subject: "Re: Quarterly planning" }, "Notify a reviewer that a draft is ready."),
  event("email.sent", "Email sent", "Emailable successfully sent a message.", { accountEmail: "user@example.com", to: ["recipient@example.com"], subject: "Re: Quarterly planning" }, "Record completed correspondence in another system."),
  event("email.labels_updated", "Email labels updated", "Labels were added to or removed from an email.", { emailId: "message-id", accountEmail: "user@example.com", added: ["Action Required"], removed: [] }, "Synchronize classification changes."),
  event("email.archived", "Email archived", "An email was archived from Emailable.", { emailId: "message-id", accountEmail: "user@example.com", source: "inbox" }, "Update an external mailbox index."),
  event("email.deleted", "Email deleted", "An email was moved to Trash or deleted through Emailable.", { emailId: "message-id", accountEmail: "user@example.com", provider: "gmail", source: "inbox" }, "Remove the message from an external work queue."),
  event("email_rule.created", "Email rule created", "A classification rule was created.", { rule: { emailId: "message-id", labelsApplied: ["Finance"], isPending: false } }, "Track newly learned classification guidance."),
  event("email_rule.modified", "Email rule modified", "A classification rule was changed.", { rule: { emailId: "message-id", labelsApplied: ["Finance"] }, changes: { labelsApplied: ["Finance"] } }, "Keep an external rules audit current."),
  event("email_rule.deleted", "Email rule deleted", "A classification rule was removed.", { rule: { emailId: "message-id", labelsApplied: ["Finance"] } }, "Remove stale guidance from an external index."),
  event("label.created", "Label created", "A label was created.", { label: { id: "label-id", name: "Finance", description: "Financial messages." } }, "Refresh a cached label catalog."),
  event("label.modified", "Label modified", "A label's name or description was changed.", { label: { id: "label-id", name: "Finance", description: "Financial messages and statements." }, changes: { description: "Financial messages and statements." } }, "Synchronize label metadata."),
  event("label.deleted", "Label deleted", "A label was removed.", { label: { id: "label-id", name: "Finance" } }, "Remove a label from an external catalog."),
];

export function createWebhookEnvelope(eventName, payload, { eventId = "evt_123", schemaVersion = WEBHOOK_SCHEMA_VERSION, timestamp = "2026-11-07T18:14:02Z" } = {}) {
  return { event_id: eventId, event_name: eventName, schema_version: schemaVersion, payload, timestamp };
}

export function parseActivityCallbackPayload(body) {
  const parsed = activityCallbackSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`).join("; ") };
  const value = parsed.data;
  return { ok: true, value: { schemaVersion: value.schema_version, eventId: value.event_id, activityId: value.activity_id, status: value.status, source: value.source, title: value.title, description: value.description, timestamp: new Date(value.timestamp), data: value.data, error: value.error ?? null } };
}

function event(name, title, description, payload, useCase) { return { name, title, description, payload, useCase }; }
function jsonByteLength(value) { return new TextEncoder().encode(JSON.stringify(value)).length; }
