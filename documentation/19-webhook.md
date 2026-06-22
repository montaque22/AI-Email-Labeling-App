---
title: Webhook
slug: webhook
order: 19
---

# Webhook

A webhook lets Emailable notify another application when something happens. Instead of repeatedly asking Emailable whether a label, rule, draft, or email changed, your service provides a URL and Emailable sends an HTTP request when the event occurs.

Use a webhook when n8n, Home Assistant, or your own service needs to react to Emailable activity.

Examples include:

- Starting an n8n workflow when polling receives new mail.
- Recording label and rule changes in another system.
- Sending a notification when Emailable creates a draft.
- Updating a dashboard when a message is relabeled or deleted.

## Configure the webhook

1. Open **Settings > Webhook**.
2. Enter the complete HTTPS URL that should receive events.
3. Optionally enter a bearer token expected by the receiver.
4. Select **Save**.
5. Trigger a non-critical event and confirm delivery under **Metrics > Logs > Webhook Events**.

Leave the URL blank to stop webhook delivery.

Emailable supports one webhook destination per user. If several systems need the same events, point Emailable to an automation service that can route the event to multiple destinations.

## Request format

Emailable sends a `POST` request with JSON in this shape:

```json
{
  "event_name": "label.created",
  "payload": {
    "label": {
      "name": "Invoices",
      "description": "Billing statements and invoices."
    }
  },
  "timestamp": "2026-06-21T18:30:00.000Z"
}
```

Every event includes:

- `event_name`: the kind of activity that occurred.
- `payload`: details specific to that event.
- `timestamp`: the UTC time Emailable sent the event.

Use `event_name` to route the request to the correct branch in your automation.

## Bearer authentication

If a bearer token is saved, Emailable sends:

```http
Authorization: Bearer your_token
```

Create a long random token and configure the same value in the receiving application. The token helps the receiver reject requests that did not come from your configured Emailable instance.

The token is optional, but an unauthenticated public webhook URL is easier for others to call. Use HTTPS and authentication for production workflows.

## Email events

### `email.received`

Sent when polling finds eligible messages. One event contains the fetched messages for that poll rather than one request per message.

Useful fields include the account email, To, From, Subject, email ID, and simplified body.

Use this to start downstream workflows, notifications, or archival actions after polling receives mail.

### `email.drafted`

Sent after Emailable creates a draft. The payload includes To, From, Subject, body content, account information, provider details, and draft identifiers when available.

Use this to notify a reviewer or record that a draft is waiting.

### `email.sent`

Sent after an email is successfully sent from the Inbox compose or reply flow. It includes the recipients, sender, subject, and body.

### `email.labels_updated`

Sent when Emailable adds, removes, or replaces a label or folder on a message. The payload identifies the message and account, lists the labels added and removed, and includes useful message context such as the subject, sender, and simplified body when available.

Use this to synchronize another system or react to a classification.

### `email.deleted`

Sent after Emailable successfully deletes a message through the Inbox. It identifies the message, account, provider, and source action.

## Rule events

Emailable sends:

- `email_rule.created`
- `email_rule.modified`
- `email_rule.deleted`

Create and modify events include the resulting rule and relevant input or previous state. Delete events include the rule that was removed.

Use these events when another system needs to track pending reviews or keep a record of how classification guidance changes.

## Label events

Emailable sends:

- `label.created`
- `label.modified`
- `label.deleted`

The payload contains the affected label. Modify events include the before and after values where available.

Use these events to refresh cached label lists or keep another classification system synchronized.

## Delivery behavior

Emailable waits up to eight seconds for the receiving server. A response with a successful HTTP status records a successful delivery. A non-success status, network error, or timeout records a failed delivery under **Metrics > Logs > Webhook Events**.

The receiver should validate the request, store or queue the event quickly, and return a successful response. Long-running work should happen after the receiver acknowledges the webhook.

## Important notes

- Webhooks are notifications, not a database replication protocol. Build receivers so processing the same event more than once does not cause damage.
- A webhook failure does not undo the Emailable action that produced it. For example, a label can be applied even if the webhook receiver is offline.
- Review Webhook Events logs when an automation appears not to run.
- Avoid logging or forwarding sensitive email bodies unless the destination is trusted.
- The saved bearer token authenticates Emailable to your receiver. It is not an Emailable API key and cannot call Emailable endpoints.
- Local URLs such as `127.0.0.1` refer to the Emailable server itself. Use an address that the Emailable process can actually reach.

