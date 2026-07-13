---
title: Endpoints
slug: endpoints
order: 18
---

# Endpoints

Endpoints let another application use Emailable through ordinary HTTP requests. They are useful for n8n, Home Assistant, scripts, scheduled jobs, and services that support REST APIs but do not support MCP.

Use endpoints when an external workflow needs to read Emailable's current configuration, classify a message, remove a label, create a reply draft, query rules, or ask your connected AI platform to process an email.

## Endpoints versus MCP

Both options expose Emailable features, but they are intended for different clients:

| Use endpoints when | Use the MCP Server when |
| --- | --- |
| The client makes ordinary HTTP requests. | The client understands MCP tools. |
| You want to control the exact request and response. | You want an AI client to discover tools automatically. |
| You are building an n8n HTTP Request node, script, or integration. | You are configuring an MCP Client node or assistant. |

You do not need to enable the MCP Server to use REST endpoints.

## Create an API key

1. Open **Settings > Endpoints**.
2. Enter a descriptive key name, such as `n8n production`.
3. Select **Create API Key**.
4. Copy the complete key immediately. Emailable only shows it once.
5. Store it in the calling application's credential or secret manager.

Send the key in every request:

```http
Authorization: Bearer your_emailable_api_key
Content-Type: application/json
```

The key is tied to the Emailable user who created it. It can only access that user's labels, rules, settings, and connected accounts.

Create a separate key for each client. This lets you revoke one integration without interrupting the others.

## Find the complete URL

Each endpoint card includes a copy icon. It copies the current host and endpoint path together.

For a public deployment, a URL may look like:

```text
https://emailable.example.com/api/integrations/core-content
```

For a local or Home Assistant add-on installation exposed on port 3000, it may look like:

```text
http://10.0.0.165:3000/api/integrations/core-content
```

An external service cannot normally reach `127.0.0.1`, a Home Assistant ingress URL, or a private home-network address unless it runs on the same network or uses a suitable VPN, tunnel, or reverse proxy.

## Available endpoints

The Endpoints page contains collapsible examples with the current payload and response shape. Use those examples as the source of truth when building an integration.

### Get Core Content

Returns the content an external AI workflow commonly needs:

- The current confidence threshold as a number.
- The user's labels and descriptions.
- Saved AI prompts with supported template strings replaced by current values.

Use this endpoint when n8n or another service performs the AI work outside Emailable and needs the same labels, threshold, and instructions configured in the app.

### Query Email Rules

Searches rules using AND/OR groups. Supported fields are:

- `fromEmail`
- `fromName`
- `subject`
- `isPending`

Supported comparisons are `equals`, `notEquals`, and `contains`. The maximum result limit is 200.

Use this endpoint when an automation needs prior decisions as context or needs to find pending rules.

### Add Label to Email

This is a classification endpoint, not a command to blindly apply several labels. The caller supplies up to three candidates. Each candidate includes:

- An existing Emailable label name.
- A confidence value.
- A reason of 200 characters or fewer.

Emailable applies only the single uniquely highest candidate when it meets the current threshold. For a folder-based account, it moves the message into the corresponding folder.

If the result is tied, below the threshold, or otherwise uncertain, Emailable creates a pending rule instead of choosing a label. Existing relevant rules may provide enough guidance to label the message without creating a duplicate rule.

### Remove Label from Email

Removes one Emailable label from a message. For folder-based providers, the provider's folder behavior determines where the message is placed after removal.

Use this when an external workflow knows a specific label should no longer be attached.

### Create Draft Reply

Creates a draft reply in the connected account that owns the original email. The request includes the account email, original email ID, reply text, and whether to reply to all recipients.

This endpoint creates a draft for review. It does not immediately send the message.

### AI Reply

Finds an email, uses the active AI platform and Emailable's internal reply-writing guidance, and creates a draft reply. `emailId` is required; `accountEmail` is optional but makes the search faster.

This endpoint is only usable while BYOAI is active. Its status tag on the page shows whether it is enabled.

### AI Label

Finds an email, loads relevant rules, calls the active AI platform with structured output requirements, and applies one label or creates a pending rule.

`emailId` is required. Provide `accountEmail` when known so Emailable can avoid searching every connected account.

This endpoint is only usable while BYOAI is active.

## Basic request example

```bash
curl https://emailable.example.com/api/integrations/core-content \
  -H "Authorization: Bearer your_emailable_api_key"
```

For a POST request, add JSON:

```bash
curl https://emailable.example.com/api/integrations/ai/label \
  -X POST \
  -H "Authorization: Bearer your_emailable_api_key" \
  -H "Content-Type: application/json" \
  -d '{"emailId":"188c1f2d7e1a1234","accountEmail":"owner@example.com"}'
```

## Monitor endpoint calls

Open **Metrics > Logs** and choose **Endpoints** to see:

- Which endpoint was called.
- The request payload.
- Whether it succeeded.
- The response summary or error.

Avoid placing secrets inside ordinary payload fields because endpoint payloads may appear in these user-visible diagnostic logs.

## Important notes

- API keys are different from application login sessions and MCP keys.
- Treat API keys like passwords. Never commit them to source control or expose them in browser-side code.
- Revoking a key immediately prevents future requests that use it.
- Endpoint actions are real; there is no general dry-run mode.
- Label names supplied by callers must exist in Emailable. Use Get Core Content to obtain the current names.
- Provider permissions, rate limits, and expired account credentials can still cause an authenticated endpoint request to fail.
- AI endpoints can consume provider quota and are disabled when BYOAI is inactive.
- Use HTTPS whenever an API key crosses a network you do not fully control.
