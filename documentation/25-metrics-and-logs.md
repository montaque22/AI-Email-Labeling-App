---
title: Metrics and Logs
slug: metrics-and-logs
order: 25
---

# Metrics and Logs

Metrics and Logs provide two different views of Emailable activity:

- **Metrics** answer, "How much is Emailable doing over time?"
- **Logs** answer, "What happened during a specific operation?"

Use Metrics to understand trends and workload. Use Logs to confirm that an automation ran or diagnose why one failed.

## Metrics tab

Open **Metrics** from the main menu. The first tab summarizes activity with charts.

### Rules Created

Shows how many rules were created over time.

Use it to understand how often Emailable is uncertain. A sustained increase can mean new types of email are arriving, labels overlap, the confidence threshold is conservative, or existing rules need review.

### Pending versus Non-Pending Rules

Shows the current balance between rules that need review and rules that have been reviewed.

Use it to see whether the review queue is growing. Reviewing pending rules helps Emailable use clearer prior decisions for similar messages.

### Emails Labeled

Shows the number of email labeling operations over time.

This includes supported labeling actions performed through Emailable workflows, including API and MCP-driven processing when they use the same internal labeling logic.

Use it to monitor classification volume and spot unexpected spikes or gaps.

### Drafts Created

Shows how many drafts Emailable created over time.

Use it to understand reply automation volume and confirm that draft-producing workflows are active.

## Logs tab

Open **Metrics > Logs** to see simplified operational records. Logs are intended for troubleshooting and audit context; they are not the raw Node.js server console.

Use the category selector to focus the list:

### All

Shows every supported log category together. Start here when you know approximately when something happened but not which subsystem produced it.

### AI

Shows AI platform connections, disconnections, provider failures, invalid responses, quota problems, and other AI processing events.

Use it when AI Label, AI Reply, AI Draft, or provider testing fails.

### Email

Shows polling results and supported email actions such as sending or deleting messages.

Polling entries summarize fetched, processed, and failed messages. Individual failure details help identify an expired account, malformed email, provider error, or AI classification problem.

### Endpoints

Shows REST endpoint calls, request payloads, success status, response summaries, and errors.

Use it when n8n, Home Assistant, or a script receives an unexpected response. This category also includes the AI endpoints.

### Webhook Events

Shows whether webhook events were delivered or failed, including the event name and relevant response details.

Use it when the Emailable action succeeded but the receiving automation did not run.

### MCP Server

Shows MCP tool calls made to Emailable's external MCP Server. Entries identify the tool input and the internal operation triggered by the call.

Use it to understand what an MCP client asked Emailable to do and whether the tool completed successfully.

## Read a log entry

A log entry includes a timestamp, category, event or operation name, status, message, and relevant payload details.

When troubleshooting:

1. Choose the narrowest relevant category.
2. Find the timestamp when the operation occurred.
3. Check whether the status is success or error.
4. Review the request or event payload.
5. Read the error before retrying the operation.
6. Confirm related account, AI, label, or webhook settings when the error points to a dependency.

## Export logs

Select the export icon to download the logs for the current selection as a JSON file.

The browser prepares the export in a background worker so a larger export does not freeze the page. The export button is disabled while the file is being prepared, and the download begins automatically when it is ready.

Export logs before deleting them when you may need the information for support or later investigation.

## Delete logs

Select the trash icon and confirm the warning to delete logs.

This action purges all of your stored system logs, not only the currently selected category. It cannot be undone. Export first when you need a copy.

## Retention

Emailable automatically removes logs older than seven days. Cleanup runs when the server starts and continues regularly while it is running.

This keeps the database from growing indefinitely. Export important diagnostic information before it reaches the retention limit.

## Alarms

Use the **Alarms** tab when you want Emailable to watch logs for repeated errors and show a clear Ok, Unknown, or Error state.

Alarms are useful for patterns like repeated AI quota failures, polling errors, webhook delivery failures, or MCP tool problems. See [Alarms](documentation/alarms) for setup examples and guidance.

## Important notes

- Metrics are summaries and may not contain enough detail to explain a failure. Use Logs for diagnosis.
- Logs can contain email addresses, subjects, request payloads, and error details. Treat exported files as sensitive.
- Logs do not store full raw provider responses for every operation.
- A successful endpoint or MCP call can still trigger a separate webhook delivery failure. Check both relevant categories.
- Clearing logs does not clear metrics, email rules, labels, connected accounts, or provider mail.
- Missing activity may mean the operation did not reach Emailable, the relevant feature was disabled, or the log is older than seven days.
