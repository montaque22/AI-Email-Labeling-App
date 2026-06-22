---
title: Polling
slug: polling
order: 17
---

# Polling

Polling lets Emailable periodically look for new mail and classify it without waiting for another automation system to call an endpoint.

Use polling when you want Emailable to manage the complete workflow: find eligible messages, analyze them with your AI provider, apply the best label or folder, and create a pending rule when the result needs review.

If polling is off, Emailable still works. You are responsible for starting processing through REST endpoints, MCP tools, n8n, Home Assistant, or another external workflow.

## Requirements

Polling requires:

- At least one connected email account.
- At least one successfully connected AI platform under **Artificial Intelligence > BYOAI**.
- BYOAI set to **Activate**.

The Polling switch is disabled when AI is unavailable. If BYOAI is turned off later, polling turns off automatically.

## Configure polling

1. Open **Settings > Email Accounts**.
2. Find the **Polling** section.
3. Set the polling interval.
4. Set how far back Emailable should search.
5. Select **Save**.
6. Turn on **Activate** when you are ready.

### Polling interval

The interval controls how often Emailable begins a scheduled check.

- Minimum: 10 minutes.
- Maximum: 720 minutes, or 12 hours.
- Default: 15 minutes.

Shorter intervals find messages sooner but make more provider and AI requests.

### Search lookback

The lookback controls how old a message may be and still be considered during a poll.

- Minimum: 1 hour.
- Maximum: 7 days, or 168 hours.
- Default: 24 hours.

A lookback longer than the interval provides overlap, which helps avoid missing mail after a temporary provider or server interruption. Emailable filters already processed messages so this overlap does not normally classify them again.

## What happens during a poll

For each connected account, Emailable:

1. Searches for messages inside the configured lookback period.
2. Combines and deduplicates the results.
3. Ignores mail that already has one of your Emailable labels or is already in an Emailable folder.
4. Allows messages carrying the hidden `Unemailable` label to be retried.
5. Passes each eligible message through the AI Label workflow.
6. Applies one label or folder when the decision is clear, or creates a pending rule when review is required.
7. Records the result under **Metrics > Logs > Email**.

One failed message does not prevent other messages in the same poll from being processed. The log records individual failures so they can be investigated.

## Run a poll manually

Select **Poll now** to test the current configuration or check immediately instead of waiting for the next interval.

After a manual poll begins, the button has a 10-second cooldown. This prevents repeated clicks from starting overlapping provider and AI requests.

Review **Metrics > Logs > Email** after the run to see how many messages were fetched, processed, or failed.

## Webhook event

When polling receives eligible messages, Emailable sends one `email.received` webhook event for the poll. Its payload contains the fetched emails with useful fields such as:

- `emailId`
- `accountEmail`
- `to`
- `from`
- `subject`
- Simplified body content

The messages are grouped into one event rather than sending a separate webhook request for every email.

## Cost and performance

Every eligible message can require provider searches, message retrieval, and an AI request. Costs and processing time increase with:

- More connected accounts.
- A shorter polling interval.
- A longer lookback.
- High incoming mail volume.
- Verbose prompts or enabled MCP tools.
- AI provider pricing and rate limits.

Start with the 15-minute interval and 24-hour lookback. Change them only when you have a clear reason.

## Important notes

- Polling is periodic, not instant push delivery. A message can wait until the next configured run.
- Messages already carrying an Emailable label or folder are intentionally skipped. This prevents repeated processing.
- The hidden `Unemailable` label is an exception so Emailable can retry a message that previously failed.
- Provider outages, expired account credentials, AI quota limits, and invalid label output can cause individual failures.
- Keep the account status and AI platform status current. Polling cannot repair expired provider authorization.
- Use Logs to confirm behavior before relying on polling for important mail.

