---
title: Alarms
slug: alarms
order: 26
---

# Alarms

Alarms help you notice repeated problems without watching the logs all day.

Use an alarm when you want Emailable to watch a log group and tell you when a certain kind of error keeps happening. For example, you may want an alarm when an AI provider starts rejecting requests because the quota was exceeded, or when email processing fails repeatedly in a short period of time.

## What alarms are for

Alarms are for repeated error patterns.

They are most useful when:

- An error can happen once without being urgent.
- The same error happening many times means something needs attention.
- You want to filter for a specific error message, not every error in a log group.
- You want to understand whether a subsystem is healthy at a glance.

Alarms do not replace the Logs page. Logs show the details. Alarms summarize whether a pattern has crossed a threshold.

## Where to find alarms

Open **Metrics** from the side menu, then choose the **Alarms** tab.

The Alarms page shows:

- A list of saved alarms.
- The current alarm status.
- A graph preview for the selected alarm.
- Buttons to create, edit, or delete alarms.

Click an alarm row to preview its timeline graph. Use the edit icon to change the alarm.

## Alarm statuses

Each alarm can show one of three statuses:

- **Ok**: the current log data does not cross the alarm threshold.
- **Unknown**: there are no matching logs in the selected time window, so Emailable cannot determine a meaningful state yet.
- **Error**: the matching errors crossed the configured threshold.

Unknown is common when an alarm is new, the log group is quiet, or the filter is very specific.

## Create an alarm

Click **Create Alarm**.

Give the alarm a clear name and description. The name should explain what the alarm watches. The description should explain why the alarm matters.

Example:

- Name: `AI quota errors`
- Description: `Alerts when the AI provider starts rejecting requests because quota is exceeded.`

## Log group

The log group tells Emailable which logs to inspect.

Available groups include:

- **AI**: AI platform calls, provider failures, quota errors, prompt execution, and AI tool activity.
- **Email**: polling, sending, deleting, archiving, and email processing events.
- **Endpoints**: REST API calls, including calls from n8n or other external systems.
- **Webhook Events**: webhook delivery attempts and failures.
- **MCP Server**: calls made to Emailable's MCP Server.

Choose the group closest to the problem you want to monitor.

## Calculation type

Calculation type defines when the alarm enters an error state.

It has three parts:

1. **Above or Below**
2. **A number**
3. **error or errors**

Examples:

- `Above 10 errors`
- `Below 1 error`

Most alarms use **Above**. This means the alarm triggers when the number of matching errors is greater than the number you entered.

Use **Below** only for special cases where too few errors is meaningful. Most users will not need it.

## Filter

The filter lets you narrow the alarm to a specific error message or phrase.

There are two options:

- **None**: count all errors in the selected log group.
- **Contains**: count only errors whose log content contains the text you enter.

The Contains filter is case-insensitive. Emailable checks the log message and stored log payload text.

Example:

```text
Contains "You exceeded your current quota"
```

This is useful when a log group contains many kinds of errors but you only care about one recurring problem.

## Time

The Time control defines the active window for the alarm.

It reads like this:

```text
within 10 minutes
```

Emailable checks matching logs inside that rolling time window.

For example:

```text
AI log group
Above 10 errors
Contains "You exceeded your current quota"
within 10 minutes
```

This means:

1. Look at the AI logs from the last 10 minutes.
2. Keep only error logs containing `You exceeded your current quota`.
3. If more than 10 matching errors exist, set the alarm status to Error.

## Graph preview

The graph shows recent matching errors compared against the threshold.

Use the graph to answer:

- Is this alarm likely to trigger often?
- Is the threshold too sensitive?
- Is the filter too broad or too narrow?
- Are errors clustered in one time period?

The graph can be viewed by day, hour, or minute. Use a wider view for trends and a narrower view for recent bursts.

## Editing an alarm

Click an alarm, then click the edit icon.

You can change:

- Name
- Description
- Log group
- Calculation type
- Filter
- Time window

The graph updates as you change the values, so you can see the effect before saving.

## Delete alarms

Select one or more alarms from the list, then click the trash icon.

Deleting an alarm removes only the alarm configuration. It does not delete logs, metrics, emails, labels, rules, or connected accounts.

## Good alarm examples

### AI quota alarm

```text
Log group: AI
Calculation type: Above 3 errors
Filter: Contains "quota"
Time: within 10 minutes
```

Use this to detect when an AI provider starts rejecting requests because quota or billing limits were reached.

### Email polling failure alarm

```text
Log group: Email
Calculation type: Above 5 errors
Filter: Contains "poll"
Time: within 30 minutes
```

Use this to notice repeated polling failures.

### Webhook failure alarm

```text
Log group: Webhook Events
Calculation type: Above 2 errors
Filter: None
Time: within 15 minutes
```

Use this when external automations depend on webhooks being delivered.

## Tips

- Start with a higher threshold, then lower it if you miss important issues.
- Use Contains when the log group has many unrelated errors.
- Keep filter text short and specific.
- If an alarm stays Unknown, widen the time window or remove the filter.
- If an alarm is always Error, increase the threshold or make the filter more specific.

## Important notes

- Alarms depend on logs. Logs older than the retention window are removed.
- Alarms do not stop processing by themselves. They report state so you know what needs attention.
- A broad filter can trigger on unrelated errors.
- A very specific filter can miss similar errors with slightly different wording.
- Log payloads may contain sensitive operational details. Treat alarm names and descriptions accordingly.

## Related documentation

- Read [Metrics and Logs](documentation/metrics-and-logs) to understand log categories and retention.
- Read [Bring Your Own AI](documentation/bring-your-own-ai) for AI provider setup and quota-related failures.
- Read [Polling](documentation/polling) for email polling behavior.
- Read [Webhook](documentation/webhook) for webhook event delivery.
