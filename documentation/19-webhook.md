---
title: Webhooks and Activity Callbacks
slug: webhook
order: 19
---

# Webhooks and Activity Callbacks

Emailable supports two related integrations:

- **Outbound Webhooks (Emailable → external system):** Emailable sends events to your configured destination.
- **Activity Callbacks (external system → Emailable):** your workflow optionally reports completed or failed outcomes back to the email's Automation Activity section.

They use different URLs and payloads. The outbound bearer token authenticates Emailable to your destination. A generated secret callback URL authorizes generic external workflows to report activity; the native Home Assistant integration uses its existing Emailable API key instead.

## Configure outbound webhooks

1. Open **Settings > Webhook**.
2. Under **Outbound Webhooks**, enter the complete HTTP or HTTPS destination URL.
3. Optionally enable the Authorization bearer token and enter the token expected by your receiver.
4. Select **Save**.
5. Trigger a non-critical event and check **Metrics > Logs > Webhook Events**.

Leave the destination blank to disable outbound delivery. Emailable supports one destination per user. Use an external router such as n8n if several systems need the same events.

## Outbound webhook format

Every outbound request is a JSON POST with this envelope:

~~~json
{
  "event_id": "evt_123",
  "event_name": "email.ready_for_processing",
  "schema_version": "1.0",
  "payload": {},
  "timestamp": "2026-11-07T18:14:02Z"
}
~~~

| Field | Meaning |
| --- | --- |
| `event_id` | Unique identifier for this emitted event. Save it for callbacks and idempotency. |
| `event_name` | Event type used to route the request. |
| `schema_version` | Contract version. The current version is `1.0`. |
| `payload` | Event-specific data. |
| `timestamp` | UTC time Emailable created the outbound event. |

When a bearer token is configured, Emailable adds `Authorization: Bearer <token>`. Use HTTPS and a long random token for production.

## Outbound events

### `email.ready_for_processing`

Sent after an email is fully ingested, classified, and its labels are committed. This is the primary post-processing event. It includes email identity and content, attachment metadata and available content, final classification, and `payload.activity_callback.url` with its callback `schema_version`.

Use the top-level `event_id` when reporting activity. Treat the callback URL as a secret and do not log it.

### Email lifecycle events

- `email.received`: polling found messages eligible for processing. One event may contain several messages from the poll.
- `email.drafted`: Emailable created a draft.
- `email.sent`: Emailable successfully sent a message.
- `email.labels_updated`: labels were added, removed, or replaced.
- `email.archived`: Emailable archived a message.
- `email.deleted`: Emailable moved a message to Trash or deleted it through an inbox action.

### Rule events

- `email_rule.created`
- `email_rule.modified`
- `email_rule.deleted`

Create and modify events contain the resulting rule and relevant input or previous state. Delete contains the removed rule.

### Label events

- `label.created`
- `label.modified`
- `label.deleted`

These contain the affected label; modified events include changed values where available. The settings page contains a representative, copyable envelope for every event currently emitted.

## Outbound delivery behavior

- Delivery is one attempt with an eight-second timeout. There is no automatic retry.
- A successful HTTP response means the destination accepted the request. It does not prove downstream work completed.
- A failure never rolls back the Emailable action that produced the event.
- Some events are queued for background dispatch. They may arrive after the change is visible, and events from bulk work can arrive out of order.
- Build receivers to be idempotent using `event_id`, acknowledge quickly, and perform long-running work after returning success.
- Delivery results appear under **Metrics > Logs > Webhook Events**. Sensitive callback secrets and attachment bodies are redacted from logs.

## Activity callbacks

Activity callbacks let an external workflow report what it did after receiving `email.ready_for_processing`. Open **Settings > Webhook > Activity Callbacks** to enable callbacks, copy the secret URL, review quota, or rotate the URL.

POST this canonical v1.0 payload to the callback URL:

~~~json
{
  "schema_version": "1.0",
  "event_id": "evt_123",
  "activity_id": "activity_456",
  "status": "completed",
  "source": "n8n",
  "title": "Document created",
  "description": "Summary saved to the project folder.",
  "timestamp": "2026-11-07T18:14:05Z",
  "data": {
    "document_id": "doc_123",
    "url": "https://example.com/documents/doc_123"
  }
}
~~~

For a failed callback, include an optional `error` object:

~~~json
{
  "schema_version": "1.0",
  "event_id": "evt_123",
  "activity_id": "activity_456",
  "status": "failed",
  "source": "n8n",
  "title": "Document creation failed",
  "description": "The external workflow could not create the document.",
  "timestamp": "2026-11-07T18:14:05Z",
  "data": { "workflow_run_id": "run_789" },
  "error": { "code": "AUTH_EXPIRED", "message": "Authentication expired" }
}
~~~

Required fields are `schema_version`, `event_id`, `activity_id`, `status`, `source`, `title`, `description`, `timestamp`, and `data`. Status must be `completed` or `failed`. `error` is accepted only for `failed`.

Limits:

- Request: 64 KB.
- `event_id` and `activity_id`: 200 characters each.
- `source`: 100 characters.
- `title`: 200 characters.
- `description`: 2,000 characters.
- `data`: 32 KB of JSON.
- `error`: 16 KB of JSON.
- Default quota: 500 callbacks per UTC day, five per second with a burst of ten. The settings page shows the instance's actual limits.

## Reporting outcomes

1. Receive `email.ready_for_processing`.
2. Save its top-level `event_id` and the callback URL.
3. Choose one stable `activity_id` for each independent operation.
4. Optionally send either `completed` or `failed` after that operation finishes.

The callback `timestamp` is the external system's reported outcome time. Emailable separately records when it received the callback. If no callback is received, Emailable records no activity and makes no assumption about external work.

Exact duplicate reports are idempotent. A contradictory outcome using the same activity ID is rejected. Multiple independent operations may use different activity IDs for the same event. Automation Activity clearly states that outcomes are reported by the external system and are not independently verified by Emailable.

Home Assistant users can call `emailable.activity_completed` and `emailable.activity_failed` instead of constructing HTTP requests. Those native actions authenticate with the existing Emailable integration API key. Generic systems such as n8n and Node-RED should continue using the generated callback URL. Both methods use this same schema, quota, correlation, persistence, and logging behavior.

The HACS integration also registers its own private inbound Home Assistant webhook for `email.ready_for_processing`. That destination is stored separately from the general-purpose outbound webhook on this page, so enabling Home Assistant does not replace an n8n, Node-RED, or custom destination. Emailable attempts Home Assistant delivery once and does not poll, retry, or replay missed events.

## Connecting an external workflow

1. Save the external workflow's receiver under **Outbound Webhooks**.
2. Route `email.ready_for_processing` into your automation.
3. Store `event_id` and read `payload.activity_callback.url`.
4. Send a canonical Completed or Failed callback after an operation finishes.
5. Verify activity on the email and inspect Webhook Events logs if delivery or callbacks fail.

## Logging and security

Outbound delivery and inbound callback lifecycle entries use the **webhook** log category. Logs include event and activity identifiers, but callback secrets and attachment content are redacted.

- Never expose or log the callback URL.
- Rotating the callback URL immediately invalidates the old URL; update every external workflow after rotation.
- The outbound bearer token cannot call Emailable APIs.
- Localhost addresses resolve from the Emailable server, not from your browser.
- Send email bodies and attachments only to destinations you trust.

## Troubleshooting

- **No outbound request:** confirm a destination is saved and check Webhook Events logs.
- **401/403 from your receiver:** confirm its expected bearer token matches Settings.
- **404 from a callback:** the callback is disabled, rotated, belongs to another user, or the `event_id` is unknown.
- **400 from a callback:** compare the body with canonical v1.0. Obsolete `started_at`, `ended_at`, `result_url`, and `details` fields are rejected.
- **409 from a callback:** a different terminal outcome is already recorded for the same activity.
- **429 from a callback:** slow the sender or wait for the UTC daily quota reset.
- **No Automation Activity appears:** external systems are not required to report an outcome. Confirm the workflow sent a Completed or Failed callback if an entry was expected.
- **Attachment unavailable:** inspect `unavailable_reason`; metadata remains present even when content could not be loaded.
