---
title: Easy Setup
slug: easy-setup
order: 10.5
---

# Easy Setup

Use this guide when Emailable is already running and you want Emailable to handle the email classification logic for you. This path unlocks the most features: polling, AI labeling, AI draft help, inbox automation, custom prompts, AI Actions, metrics, and logs.

## 1. Add email accounts

Open **Settings > Email Accounts** and choose **Add Email Account**.

Emailable supports:

| Account type | Use this when | What it lets Emailable do |
| --- | --- | --- |
| Google | You want to connect a Gmail account with OAuth. | Read mail, apply labels, create drafts, send replies, and sync label IDs. |
| IMAP | You want to connect another provider. | Read mail and use folders as Emailable categories. |

Google opens a normal Google consent screen. IMAP asks for server settings and an app password. For IMAP, use a provider-generated app password when possible instead of your main account password.

After an account is connected, it appears in the account list. Use **Recheck** if you want Emailable to verify that account access is still valid.

## 2. Set up labels

Open **Labels** and create the categories Emailable should use. Labels are the shared vocabulary between your inbox, AI, rules, endpoints, MCP tools, and external automation systems.

You can:

- Add labels manually.
- Upload labels from a CSV.
- Choose labels or folders that already exist in connected providers.

For Gmail, Emailable applies Gmail labels. For IMAP accounts, Emailable treats folders as labels and moves messages into the matching folder.

Good labels are specific enough for automation but broad enough to reuse. For example, `Action Required`, `Finance`, `Security`, and `Reference` are often more useful than dozens of tiny one-off labels.

## 3. Set the confidence threshold

Open **Settings > Confidence Threshold**.

The confidence threshold controls how certain AI must be before Emailable labels an email automatically. If AI is below the threshold, Emailable creates a rule for review instead of silently choosing a label.

Common values:

| Threshold | Behavior |
| --- | --- |
| `0.95` | Very conservative. |
| `0.90` | Recommended. |
| `0.80` | More aggressive automation. |
| `0.70` | High automation with higher risk. |

Start with `0.90` unless you already know you want more or less automation.

## 4. Confirm the timezone

Open **Settings > System** and confirm the timezone.

The timezone is used when Emailable renders time-aware values such as `{{now}}` in custom prompts. This matters when AI creates calendar events, reminders, commitments, or other time-sensitive automation.

The default is the Seattle timezone, `America/Los_Angeles`. Change it if your normal working timezone is different.

## 5. Add and activate an AI platform

Open **Artificial Intelligence > BYOAI**.

Add an AI platform, enter the required API key or local model details, then save it. Emailable tests the connection before it marks the platform as connected.

Once at least one platform is connected, turn on **Activate**.

Activating AI unlocks:

- AI labeling through polling.
- AI draft help when writing replies.
- AI Actions on emails.
- Custom prompt automations.
- Better inbox assistance through the AI Helper.

## 6. Optional: turn on polling

After AI is active, return to **Settings > Email Accounts** and enable **Polling**.

Polling lets Emailable periodically check connected accounts for new mail. When new messages are found, Emailable analyzes them, applies the best label when confident, and creates reviewable rules when uncertain.

If polling is off, you can still use Emailable by sending email data through endpoints, MCP tools, webhooks, or another automation system such as n8n or Home Assistant.

## What to do next

After completing Easy Setup, open **Inbox** to view messages by label and start reviewing how Emailable is organizing mail.

If you want external systems to interact with Emailable, continue to **Endpoints**, **Webhook**, or **MCP Server** documentation.
