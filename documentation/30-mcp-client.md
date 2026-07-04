---
title: MCP Client
slug: mcp-client
order: 30
---

# MCP Client

Emailable's MCP Client lets Emailable connect to other MCP servers and make their selected tools available to the artificial intelligence platforms configured under BYOAI.

This extends what Emailable's AI can do. Instead of only reading an email and returning text or a label decision, the AI can use approved tools to look up information or trigger actions in another system while it works.

## MCP Client versus MCP Server

The two features have opposite purposes:

| Feature | Direction | Purpose |
| --- | --- | --- |
| MCP Client under **Artificial Intelligence > BYOAI** | Emailable connects outward. | Adds tools from other MCP servers to Emailable's AI requests. |
| MCP Server under **Settings** | Other applications connect inward. | Lets n8n, Home Assistant, or another MCP client call tools provided by Emailable. |

A simple way to remember the difference is:

- The MCP **Client uses tools**.
- The MCP **Server provides tools**.

This page documents the MCP Client under **Artificial Intelligence > BYOAI**.

## Why use the MCP Client

The MCP Client is useful when Emailable's AI needs information or actions that are not built into Emailable.

Examples include:

- Looking up an order before drafting a customer reply.
- Checking a CRM for customer details while deciding how to label an email.
- Searching an external knowledge base before composing an answer.
- Creating a task when an email requires follow-up.
- Triggering a Home Assistant action when an email matches an important condition.

Selected tools are added to supported AI requests made by Emailable, including AI labeling and AI-assisted email drafting. The AI model can decide to call an available tool when the request and prompt indicate that the tool is useful.

Making a tool available does not guarantee that the AI will call it. Clear prompt instructions, good tool descriptions, and a model with reliable tool-use support improve the result.

## Example: Home Assistant security alert

You could connect Emailable to a Home Assistant MCP server and select a tool that controls a light.

In the Email Label prompt, you could add an instruction similar to:

```text
When an email clearly reports unauthorized account access, use the approved
Home Assistant light tool to turn the office warning light red. Then continue
classifying the email using the available Emailable labels.
```

When Emailable processes a matching email, the AI can call the selected Home Assistant tool and still return its label classification.

This can enable useful automations, but AI tool decisions are probabilistic. For safety-critical or guaranteed actions, use deterministic Home Assistant automations, Emailable webhooks, or REST endpoints instead of relying only on the AI to choose a tool.

## Requirements

Before the MCP Client can be activated:

- At least one BYOAI platform must be connected successfully.
- BYOAI must be activated.
- At least one MCP server must connect successfully.
- At least one tool must be selected from a connected server.
- The MCP server must be reachable from the Emailable server, not only from your browser.

Emailable supports up to five user-configured MCP servers in addition to the system-managed MCP tools row.

## Add an MCP server

1. Open **Artificial Intelligence**.
2. Select **BYOAI**.
3. Confirm that a working AI platform is saved and **Activate** is enabled in the BYOAI section.
4. Find the **MCP Client** section.
5. Select **Add MCP Server**.
6. Enter an optional name and the complete Streamable HTTP MCP URL.
7. Select **None** or **Bearer Token** authentication.
8. Select **Test connection**.
9. After the connection succeeds, select only the tools Emailable should expose to its AI.
10. Save the server.
11. Activate the MCP Client section.
12. Read and accept the confirmation explaining that Emailable's external MCP Server will be disabled.

Example connection:

```json
{
  "name": "Home Assistant",
  "url": "https://home-assistant-mcp.example.com/mcp",
  "authType": "bearer",
  "bearerToken": "your-server-token",
  "selectedTools": [
    "light_turn_on",
    "create_task"
  ]
}
```

The field names above illustrate the values entered in the UI. Emailable tests the connection and retrieves the actual tool list from the MCP server before it can be saved.

## System MCP tools

The MCP Client table includes a system-managed **System MCP Tools** row. These are Emailable's built-in tools that can be made available internally to supported AI providers.

The system server cannot be renamed or deleted. You can choose which of its tools are selected.

System MCP tools include operations such as finding email and working with Emailable data. They are for Emailable's internal AI requests and are separate from the external MCP Server credentials shown under Settings.

## What happens during an AI request

When the MCP Client is active, Emailable:

1. Loads the connected MCP servers and selected tools.
2. Excludes disconnected servers and unselected tools.
3. Adds the supported tool definitions to the request sent to the active BYOAI platform.
4. Allows the AI platform to decide whether a tool is needed.
5. Sends tool inputs to the appropriate MCP server when the model calls a tool.
6. Returns tool results to the model so it can complete the label decision or draft.

Tools are provided through each AI platform's native tool or MCP mechanism. Emailable does not paste tool descriptions into the system prompt as a substitute for actual tool calling.

Important caveat: connected MCP servers and selected tools are not used until the MCP Client section is activated. If MCP Client is off, Emailable keeps the saved server settings, but it does not attach those tools to AI Label, AI Reply, AI Draft, or polling requests.

## AI Draft tool picker

When BYOAI is active, MCP Client is active, and at least one tool is selected, AI Draft includes a tool picker.

Type `#` in the AI Draft prompt to open the picker. Choose a tool to insert a readable marker such as:

```text
[Use tool: find_email]
```

The marker tells Emailable that the AI request should require that selected tool. For example, while replying to a customer, you could type `#`, choose `find_email`, and ask Emailable to find an order number from a previous email before writing the reply.

If no picker appears, check these items in order:

1. BYOAI is activated.
2. MCP Client is activated.
3. The **System MCP Tools** row or another MCP server has at least one selected tool.
4. The current AI provider supports tools for the request.

## AI labeling example

Suppose an external MCP server provides `lookup_customer_risk`.

You could select that tool and add this guidance to the Email Label prompt:

```text
When an account-security email includes a customer email address, use
lookup_customer_risk before choosing between Security and Action Required.
Use the returned risk status as supporting evidence, but still return the
required Emailable label response.
```

The AI can use the tool result to improve its confidence while still returning the structured label candidates Emailable expects.

## Drafting example

Suppose an MCP server provides `find_order`.

While replying to an order-status email, a user could ask AI Draft:

```text
Look up the order mentioned in the original email and include its current
shipping status in a short, polite reply.
```

The AI can call `find_order`, use the result as context, and generate a reply that the user can review before sending.

## Important: activating MCP Client disables MCP Server

When MCP Client is activated, Emailable disables the external MCP Server under **Settings > MCP Server**.

Activation also revokes and removes existing external MCP keys. Those keys cannot be restored. If MCP Client is later deactivated and you want an external application to call Emailable again, return to **Settings > MCP Server** and create new keys.

This does not delete the system-managed internal MCP token used by Emailable for its own approved system tools. That credential is hidden and managed by Emailable.

The UI shows the MCP Server tools as disabled while MCP Client is active and provides a link back to BYOAI.

## Token usage warning

Do not select every tool simply because it is available.

MCP tools can consume substantial model context because requests may include:

- Tool names and descriptions.
- Input schemas with many properties.
- Tool-call arguments.
- Tool results returned by the server.
- Additional model turns needed to call a tool and then finish the response.

MCP servers often publish verbose descriptions and large schemas. Adding many tools can significantly increase token usage, latency, and AI provider cost on every eligible request, even when most tools are not called.

Start with the smallest useful set. A practical approach is:

1. Select one to three tools for a specific workflow.
2. Test the AI request and review the logs.
3. Add another tool only when the prompt genuinely needs it.
4. Remove tools that are unused, redundant, destructive, or too verbose.

If a server exposes dozens of tools, consider adding a smaller MCP server or gateway that exposes only the tools Emailable needs.

## Security and side effects

Selected tools may perform real actions. Emailable can send tool calls without asking for a separate confirmation inside each AI request.

- Select only tools you trust the AI to use.
- Avoid destructive tools unless their server provides its own approval or safety controls.
- Prefer narrowly scoped tools over broad administrative tools.
- Use credentials with the minimum permissions required.
- Treat bearer tokens like passwords and revoke them if exposed.
- Review **Metrics > Logs > AI** and relevant external server logs when testing.
- Treat email content as untrusted input, especially when tools can cause side effects.

For the Home Assistant example, prefer a tool that controls one dedicated warning light rather than a tool with unrestricted access to every device and service.

## Provider caveats

Tool support depends on the active AI platform and model:

- OpenAI uses native remote MCP tools and Emailable function tools for selected system tools.
- Anthropic remote MCP servers must use HTTPS in the current Emailable integration.
- Gemini uses its supported MCP tool mechanism, but the selected model must support the required tool behavior.
- Ollama models can still be used for ordinary Emailable AI requests, but the current Ollama integration does not attach MCP Client tools.

The external MCP server must also be reachable from the AI provider when that provider connects to remote MCP URLs. A URL that works only from your laptop or private LAN may not work from a cloud AI provider.

## Network caveats

`127.0.0.1` and `localhost` always refer to the machine or container making the connection.

If Emailable runs in Docker, Home Assistant, or Coolify, a local MCP server on another machine needs an address reachable from the Emailable container and, for provider-hosted remote MCP, potentially from the AI provider itself.

Use HTTPS for internet-accessible MCP servers. Verify that firewalls, reverse proxies, and authentication headers allow Streamable HTTP requests.

## Troubleshooting

### The MCP Client activation switch is disabled

Connect and activate a working BYOAI platform first. Then save at least one connected MCP server with a selected tool.

### Test connection fails

Confirm the URL points to the server's Streamable HTTP endpoint, not a web page, legacy `/sse` endpoint, or an individual tool path. Check the bearer token and verify that Emailable's server can reach the URL.

### No tools appear

The MCP server may not expose tools, may require different authentication, or may be using an unsupported transport. Check that the server supports Streamable HTTP tool discovery.

### The AI does not call a selected tool

Confirm MCP Client is activated, the server is connected, and the tool remains selected. Add a clear instruction to the relevant Email Label or Draft Reply prompt explaining when the tool should be used.

Models still decide whether a tool is useful. If an action must always happen, use a webhook or deterministic automation instead.

### Requests are slow or expensive

Reduce the number of selected tools. Prefer concise tool schemas and small tool results. Check whether the model is repeatedly calling tools or receiving unnecessarily large responses.

### Emailable's MCP Server stopped working

This is expected while MCP Client is active. Deactivate MCP Client, open **Settings > MCP Server**, and create a new MCP key for each external client.

## Related documentation

- Read [Bring Your Own AI](documentation/bring-your-own-ai) for provider setup, polling, AI endpoints, and drafting features.
- Read [MCP Server](documentation/mcp-server) when another application needs to call Emailable.
- See the [Model Context Protocol transport specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) for protocol-level details.
