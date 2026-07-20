---
title: MCP Server
slug: mcp-server
order: 20
---

# MCP Server

Emailable's MCP Server lets another application use selected Emailable features as tools. An MCP-compatible application can discover the tools, understand their input fields, and call them without you building a separate REST API workflow for every action.

MCP stands for Model Context Protocol. In simple terms, it is a standard way for an AI application or automation system to ask another application, "What tools do you provide?" and then use those tools with structured inputs.

## MCP Server versus MCP Client

The two terms describe opposite sides of the same connection:

| Component | What it does | Emailable example |
| --- | --- | --- |
| MCP Server | Provides tools for other applications to call. | The MCP Server under **Settings** lets n8n or another MCP client call Emailable tools. |
| MCP Client | Connects to a server and uses its tools. | The MCP Client under **Artificial Intelligence > BYOAI** lets Emailable use tools provided by another MCP server. |

A useful way to remember the difference is:

- A **server offers tools**.
- A **client uses tools**.

This page documents the MCP Server under **Settings**.

## Why use the MCP Server

Use Emailable's MCP Server when an external system needs to work with the email accounts, labels, drafts, or rules already configured in Emailable.

Common examples include:

- Letting an n8n AI workflow find an email and classify it.
- Allowing an AI assistant to create a draft reply without exposing provider-specific Gmail or IMAP logic.
- Querying pending rules from an automation.
- Giving one MCP-compatible client a consistent interface across all connected email providers.

The MCP Server is most useful when the calling application already supports MCP. If it only supports ordinary HTTP requests, use Emailable's REST endpoints instead.

## Before you begin

Make sure:

- Emailable is running and reachable from the MCP client.
- You are signed in to Emailable.
- The required email accounts are connected and their authorization is current.
- The labels referenced by tool calls already exist in Emailable.
- **MCP Client** is not activated under **Artificial Intelligence > BYOAI**.

## Set up the server

1. Open **Settings**.
2. Select **MCP Server**.
3. Copy the **Streamable HTTP endpoint**. It normally ends in `/mcp`.
4. Enter a descriptive key name, such as `n8n production` or `Home Assistant`.
5. Select **Create MCP Key**.
6. Copy the new bearer token immediately. Emailable only displays the complete token once.
7. Configure your MCP client with the endpoint, Streamable HTTP transport, and bearer token.

Example client settings:

```json
{
  "transport": "streamable-http",
  "url": "https://emailable.example.com/mcp",
  "headers": {
    "Authorization": "Bearer mcp_your_generated_key"
  }
}
```

The exact screen and field names vary by client, but the URL, transport, and authorization values are the same.

## n8n example

In an n8n MCP Client Tool node:

1. Select **Streamable HTTP** when a transport option is available.
2. Paste Emailable's complete `/mcp` endpoint into the MCP URL field.
3. Configure bearer authentication with the MCP key created in Emailable.
4. Use the production URL when the workflow will run as an active workflow rather than a manual test.
5. Test the connection and confirm that the Emailable tools appear.

Do not append `/sse`, `/core`, or a tool name to Emailable's endpoint. Use the exact endpoint shown on the MCP Server page.

## Available tools

### Find Email

`find_email` searches connected accounts. All fields are optional, but an empty request intentionally returns no results.

```json
{
  "subject": "Invoice for June",
  "from": "billing@example.com",
  "to": "owner@example.com"
}
```

Use `to` when possible because it narrows the search to the connected account with that address. You can also provide `emailId` when the provider message ID or RFC822 Message-ID is known.

### Add Labels On Email

`add_labels_on_email` evaluates up to three label candidates. Label names must exactly match labels stored in Emailable.

```json
{
  "emailId": "188c1f2d7e1a1234",
  "threadId": "188c1f2d7e1a1234",
  "fromEmail": "billing@example.com",
  "fromName": "Example Billing",
  "subject": "Invoice for June",
  "snippet": "Your June invoice is attached.",
  "labelsApplied": [
    {
      "labelName": "Invoice",
      "confidence": 0.96,
      "reason": "The message contains a monthly invoice."
    },
    {
      "labelName": "Reference",
      "confidence": 0.72,
      "reason": "The message may need to be retained for reference."
    }
  ]
}
```

Emailable applies the single, uniquely highest-confidence label when it meets the configured confidence threshold. If the highest candidates tie, no candidate reaches the threshold, or no candidate is supplied, Emailable creates a pending rule for review instead.

Each reason is required and must be 200 characters or fewer.

### Create Draft Reply

`create_draft_reply` creates a draft in the connected account that owns the original message.

```json
{
  "accountEmail": "owner@example.com",
  "emailId": "188c1f2d7e1a1234",
  "bodyText": "Thanks for sending this. I will review it and follow up shortly.",
  "replyAll": false
}
```

This tool creates a draft. It does not send the email. The email ID must belong to the supplied connected account.

### Query Email Rules

`query_email_rules` searches the user's rules with AND/OR groups. Supported fields are `fromEmail`, `fromName`, `subject`, and `isPending`. Supported comparisons are `equals`, `notEquals`, and `contains`.

```json
{
  "query": {
    "operator": "AND",
    "conditions": [
      {
        "field": "fromEmail",
        "equivalence": "contains",
        "value": "example.com"
      },
      {
        "field": "isPending",
        "equivalence": "equals",
        "value": true
      }
    ]
  },
  "limit": 25
}
```

The maximum query limit is 200 rules.

## Example workflow

An automation that receives a new email could:

1. Call `find_email` to confirm the message and connected account.
2. Ask its AI model to choose label candidates from Emailable's known labels.
3. Call `add_labels_on_email` with the candidates, confidence values, and reasons.
4. Let Emailable apply the best label or create a pending rule when the result needs review.

Another workflow could find a message, generate reply text, and call `create_draft_reply` so the user can review the draft before sending it.

## Home Assistant and local networking

The Home Assistant sidebar uses an ingress URL intended for browser access. An external MCP client usually cannot use that private ingress URL.

For a Home Assistant add-on installation:

1. Open the Emailable add-on's **Network** configuration.
2. Enable or choose the host-facing port for `3000/tcp`.
3. Use the Home Assistant machine's address and that port.

Example:

```text
http://10.0.0.165:3000/mcp
```

The client must be able to reach that address. A cloud-hosted client cannot normally reach a private `10.x.x.x`, `192.168.x.x`, `127.0.0.1`, or `homeassistant.local` address without a VPN, tunnel, or securely configured public reverse proxy.

For Coolify or another public deployment, use the HTTPS application domain:

```text
https://emailable.example.com/mcp
```

## Security

An MCP key is tied to the Emailable user who created it. Calls made with that key can use that user's connected accounts and MCP tools.

- Treat the key like a password.
- Do not place it in prompts, screenshots, source control, or browser-side code.
- Store it in the client's credential or secret manager.
- Use a separate key for each client so one client can be revoked without disrupting the others.
- Revoke a key immediately if it may have been exposed.
- Prefer HTTPS whenever the connection leaves a trusted local network.

The key list shows each key's prefix and last-used time, but the full secret cannot be recovered after creation.

## Important caveats

- Activating **MCP Client** under **Artificial Intelligence > BYOAI** disables Emailable's external MCP Server and revokes its MCP keys. This prevents Emailable from simultaneously acting as the externally controlled server while it handles AI tool orchestration as a client.
- The MCP endpoint uses Streamable HTTP. It is not the legacy HTTP+SSE transport, and there is no `/sse` endpoint.
- Opening the MCP URL in a normal browser sends a GET request and can show `Method Not Allowed`. This does not mean the server is broken; an MCP client communicates through protocol requests.
- Tool calls still depend on connected-provider authorization. A valid MCP key cannot repair an expired Gmail or IMAP credential.
- Provider message IDs may differ between accounts. Supply `accountEmail` or `to` when available to reduce searching and ambiguity.
- MCP tools perform real actions. Label changes and draft creation are not simulations.

## Troubleshooting

### Unauthorized or invalid MCP key

Confirm the client sends this header:

```text
Authorization: Bearer mcp_your_generated_key
```

Create a new key if the complete token was not saved. A displayed key prefix is not a usable token.

### Server not initialized

Confirm the client is configured for **Streamable HTTP**, not legacy SSE or a generic webhook request. Use the exact `/mcp` endpoint and let the MCP client perform protocol initialization and tool discovery.

### Method Not Allowed

This commonly happens when the endpoint is opened in a browser or tested with an HTTP GET. Test it with an MCP-compatible client instead.

### The server is disabled

Open **Artificial Intelligence > BYOAI** and deactivate **MCP Client**. Return to **Settings > MCP Server** and create a new MCP key because activation revokes existing keys.

### The client cannot connect

Check the URL from the machine or container where the client actually runs. `127.0.0.1` refers to that client machine or container, not automatically to Emailable.

### A tool cannot find an email

Verify that the account is connected, its authorization is current, and the ID belongs to that provider account. Add `to` or `accountEmail` when the tool supports it.

### A label call fails

Confirm the label exists in Emailable, uses the exact stored spelling, and is synchronized to the target account. Also confirm each reason is non-empty and no longer than 200 characters.

## Protocol reference

Emailable uses the MCP Streamable HTTP transport for remote client connections. See the [Model Context Protocol transport specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) for protocol-level details.
