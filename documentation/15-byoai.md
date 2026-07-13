---
title: Bring Your Own AI
slug: bring-your-own-ai
order: 15
---

# Bring Your Own AI

Bring Your Own AI, or BYOAI, lets Emailable use an artificial intelligence platform that you control. You provide the API key or Ollama connection, choose the model, and decide whether Emailable may use it.

Emailable can work without BYOAI. You can still connect email accounts, manage labels, review rules, use the Inbox, call ordinary REST endpoints, receive webhooks, and let external systems such as n8n perform their own AI analysis.

BYOAI changes who handles the AI workflow. Instead of requiring another tool to find an email, download its content, build a prompt, call an AI provider, validate the response, and send the result back to Emailable, you can give Emailable an email ID and let it handle that process.

For supported workflows, this removes the need for a separate automation tool to find and analyze emails before passing decisions to Emailable.

## What BYOAI unlocks

Activating BYOAI enables:

- Automatic email polling and classification.
- The AI Label endpoint.
- The AI Reply endpoint.
- AI Draft while composing or replying to email.
- MCP Client tools that extend Emailable's AI capabilities.
- Custom prompt automations that can run after Emailable labels an email.
- Provider fallback when a configured AI platform fails.

This allows Emailable to operate as the AI orchestrator while still using your provider account, API key, model choice, prompts, labels, rules, and confidence threshold.

## How it works

At a high level, Emailable:

1. Finds the email across the user's connected accounts.
2. Fetches the message content from the provider when it is needed.
3. Renders the appropriate internal prompt or saved custom prompt and replaces supported template values.
4. Adds relevant rules and selected MCP tools when the workflow supports them.
5. Sends the request to the default connected AI platform.
6. Validates the AI response against Emailable's expected format.
7. Applies a label, creates a rule, creates a draft, or returns a result depending on the workflow.
8. Records relevant activity in Logs.

Emailable does not require the caller to send the full email body to the AI endpoints. The caller can provide `emailId` and an optional `accountEmail`; Emailable searches the connected accounts and retrieves the email itself.

## Supported AI platforms

Emailable currently supports:

| Platform | Current model choices in Emailable | Authentication |
| --- | --- | --- |
| ChatGPT / OpenAI | `gpt-4.1-mini`, `gpt-4.1`, `gpt-4o-mini` | API key |
| Gemini | `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.0-flash` | API key |
| Anthropic | `claude-sonnet-4-5`, `claude-3-5-sonnet-latest`, `claude-3-5-haiku-latest` | API key |
| Ollama | User-supplied model name | Ollama URL and optional bearer token |

Provider model availability and pricing can change. A model listed in Emailable may still require access or billing on the provider account.

## Add an AI platform

1. Open **Artificial Intelligence**.
2. Select **BYOAI**.
3. Select **Add AI Platform**.
4. Enter an optional name.
5. Choose the provider and model.
6. Enter the provider API key.
7. For Ollama, enter the Ollama URL, model name, and optional bearer token.
8. Select **Save**.

Saving performs a test request. The platform is marked **Connected** only when that request succeeds.

The first platform is the default. You can add up to three platforms and reorder them. Additional platforms are fallbacks.

## Default and fallback behavior

Emailable tries connected platforms in their displayed order:

1. The first connected platform receives the request.
2. If that provider call fails, Emailable records the failure and tries the next connected platform.
3. Emailable stops after the first successful response.
4. If every connected platform fails, the AI request fails.

Fallback platforms are not used to compare answers or vote on the best result. They are used when an earlier provider returns an error.

Reordering platforms changes which provider is tried first. Deleting the default makes the next platform the new default.

## Activate BYOAI

The **Activate** switch becomes available after at least one platform has been tested and saved successfully.

Activation is separate from saving a provider. A connected provider can remain stored while BYOAI is inactive. In that state, Emailable does not use it for AI endpoints, polling, or AI Draft.

Turning BYOAI off also disables polling and makes MCP Client tools inactive.

## Core labeling prompt

The AI Label workflow uses an internal system prompt that is maintained by Emailable. This prompt tells the AI to:

- Analyze the email safely.
- Use the current confidence threshold.
- Use only labels that exist in Emailable.
- Look at historical rules for guidance.
- Treat pending rules as weak evidence only.
- Prefer safety over automation when uncertain.

This core prompt is no longer edited from the Prompts page. Keeping it internal makes the labeling workflow more predictable and helps prevent prompt changes from breaking validation.

The internal label prompt still renders these current values:

- `{confidenceThreshold}` for the current confidence threshold.
- `{labelTable}` for the current synchronized label names and descriptions.

## Custom prompt automations

Under **Artificial Intelligence > Prompts**, you can create your own system messages. These prompts run after Emailable has already processed and labeled an incoming email.

Use custom prompts when you want Emailable to do something with the email after classification, such as:

- Create a calendar event from a scheduling email.
- Add a task when an email has an action item.
- Notify another system when an email receives a particular label.
- Ask an MCP tool to enrich or route the email using the newly assigned label.

Each custom prompt stores:

- A name and description.
- Markdown system instructions.
- Selected MCP tools the prompt is allowed to call.
- A tool choice mode:
  - **Auto** lets the AI decide whether a selected tool is needed.
  - **Required** forces the AI to call one of the selected tools.

Tools that are not selected are not attached to that prompt's AI request. This is important for cost, speed, and safety.

Custom prompts receive the email body, subject, sender, recipient, account, provider, and the labels Emailable assigned. They can also use `{confidenceThreshold}` and `{labelTable}` if those template values are helpful.

Because these prompts can call MCP tools, avoid creating too many broad prompts. Each one can consume AI tokens and may trigger external actions.

## AI labeling

The AI Label workflow accepts an email ID and optional account email. Emailable finds the email, renders the internal label prompt, loads the available labels, and searches existing rules for relevant guidance.

The AI returns up to three candidates containing:

- An exact existing label name.
- A confidence number from 0 to 1.
- A concise reason.

Emailable then applies its own deterministic rules:

- If a relevant existing rule is found, it is used as evidence and Emailable attempts to label the email without creating a duplicate rule.
- Otherwise, a uniquely highest-confidence candidate at or above the confidence threshold is applied.
- If candidates tie, no candidate meets the threshold, or no legal candidate is returned, Emailable creates a pending rule for review.
- If processing fails and no valid label can be applied, Emailable attempts to apply the hidden `Unemailable` system label so the message can be retried.

AI providers are asked for structured label output, but Emailable still validates label names, confidence values, reason lengths, and required fields before taking action.

After labeling is complete, Emailable runs any saved custom prompts for that user. Prompt automations run in small batches so one account cannot create unlimited parallel AI calls.

## Polling

Polling is available under **Settings > Email Accounts** after BYOAI is active.

When polling is active, Emailable periodically:

1. Searches connected accounts for messages within the configured lookback period.
2. Ignores messages that already have an Emailable label or are already in an Emailable folder.
3. Allows messages with the hidden `Unemailable` label to be retried.
4. Passes each candidate through the AI Label workflow.
5. Logs the polling result and emits the configured email-received webhook event.

Polling settings support:

- An interval from 10 to 720 minutes.
- A lookback from 1 hour to 7 days.
- A manual poll button with a 10-second cooldown.

Polling automatically turns off when BYOAI becomes unavailable or is deactivated.

## AI endpoints

BYOAI enables two endpoints under **Settings > Endpoints**.

### AI Label

```json
{
  "emailId": "188c1f2d7e1a1234",
  "accountEmail": "owner@example.com"
}
```

`accountEmail` is optional. Supplying it avoids searching every connected account.

The endpoint finds the email, calls the active AI platform, and applies a label or creates a pending rule according to the current threshold and rule evidence.

### AI Reply

```json
{
  "emailId": "188c1f2d7e1a1234",
  "accountEmail": "owner@example.com"
}
```

The endpoint finds the original email, uses Emailable's internal reply-writing guidance, generates reply content, and creates a draft in the account that owns the message. It does not immediately send the email.

These endpoints require an Emailable integration API key. Provider API keys are never supplied by the endpoint caller.

## AI Draft in the Inbox

When BYOAI is active, the compose and reply experience shows **AI Draft**.

The user can describe how the message should be written. For replies, Emailable includes the original email and current draft as context while clearly instructing the AI to respond as the Emailable user, not as the original sender.

The generated response can be reviewed and applied to the email body before the message is sent or saved.

When MCP Client is active and tools are selected, AI Draft also supports a tool picker. Type `#` in the AI Draft prompt to choose from available tools. Selecting a tool inserts a readable instruction such as `[Use tool: find_email]`, which tells Emailable that the AI request should require that tool. This is useful when a reply needs information from another email, such as an order number or previous conversation.

If the `#` tool picker does not appear, check that BYOAI is active, MCP Client is active, and at least one tool is selected in **Artificial Intelligence > BYOAI > MCP Client**. Saved MCP servers are not enough by themselves; the MCP Client activation switch must be on before Emailable attaches tools to AI Draft or AI labeling requests.

## MCP Client tools

BYOAI can make selected tools from connected MCP servers available during supported AI requests. This can let the AI look up external information or trigger approved actions while labeling an email or crafting a reply.

For example, an AI labeling prompt could instruct a selected Home Assistant tool to turn a warning light red when an email clearly reports unauthorized account access.

MCP tools can increase token use, cost, latency, and risk. Select only the tools required for a specific workflow. See [MCP Client](documentation/mcp-client) for setup, provider limitations, security guidance, and the effect on Emailable's external MCP Server.

## What still works without BYOAI

BYOAI is optional. Without it, users can still:

- Connect and manage email accounts.
- Create and synchronize labels or folders.
- Use the unified Inbox.
- Review and edit rules.
- Call non-AI REST endpoints.
- Call Emailable MCP Server tools when MCP Client is inactive.
- Receive and process webhooks.
- Use n8n, Home Assistant, or another system to perform AI analysis externally.

In the external-AI approach, the automation system is responsible for fetching or receiving the email, calling its AI model, formatting a valid Emailable payload, and calling the appropriate endpoint or MCP tool.

BYOAI moves that responsibility into Emailable for its supported AI workflows.

## Privacy and data handling

AI processing sends relevant email content, prompts, and selected tool context to the chosen provider. If MCP Client is active, selected MCP servers may also receive tool arguments related to the request.

Before activating BYOAI:

- Review the AI provider's privacy and data-retention policies.
- Use an account and project appropriate for the email data being processed.
- Limit MCP tools and their permissions.
- Prefer HTTPS for remote Ollama and MCP connections.
- Avoid including secrets directly in prompt text.
- Understand that a local Ollama deployment can keep model processing local, but Emailable must be able to reach its URL.

Emailable stores provider credentials encrypted. Use HTTPS for the Emailable application so credentials and email content are protected in transit.

## Cost and quota caveats

The user is responsible for charges and quotas on connected AI platforms.

Costs depend on:

- Email and thread length.
- Prompt length.
- Label table size.
- Sent-email examples in Draft Reply.
- Number and verbosity of MCP tools.
- Tool results returned to the model.
- Polling frequency and number of candidate emails.
- Retries and provider fallbacks.

Start with a cost-efficient model and conservative polling interval. Review provider usage dashboards and **Metrics > Logs > AI** while testing.

## Provider caveats

- API keys must have access to the selected model.
- Saving or updating a platform makes a test call and may consume a small amount of quota.
- Rate limits, exhausted quotas, provider outages, or invalid model names can cause fallback or failure.
- Ollama requires a model capable enough to follow Emailable's output instructions. Small models may return weaker classifications or malformed replies.
- The current Ollama integration does not attach MCP Client tools.
- MCP support differs between OpenAI, Gemini, and Anthropic. See the MCP Client documentation before depending on provider-specific tool behavior.

## Email and provider caveats

- Connected email credentials and required scopes must remain valid.
- The optional account email speeds up searches and avoids ambiguity when similar IDs exist across providers.
- Label names returned by AI must match labels stored in Emailable.
- Labels or folders must be synchronized to the target account before they can be applied reliably.
- AI Reply creates drafts using provider capabilities; it does not bypass provider restrictions or send limits.

## Reliability and safety

AI output can be wrong even when it follows the required structure. Emailable reduces risk with confidence thresholds, existing-rule evidence, exact-label validation, pending review, and the `Unemailable` retry path, but these controls do not make every classification correct.

Use higher thresholds for sensitive mail. Review pending rules and logs regularly. Use deterministic automation for actions that must always happen or must never be triggered incorrectly.

## Troubleshooting

### Activate is disabled

Save at least one platform successfully. If the connection test fails, verify the API key, model, provider quota, Ollama URL, and network access.

### AI endpoints show Disabled

Activate BYOAI on either the BYOAI page or Endpoints page. Both switches control the same setting.

### Polling is disabled

Polling requires active BYOAI and at least one connected platform. Reactivate BYOAI, then return to Email Accounts and enable polling again.

### Email was not found

Verify the email ID belongs to a connected account. Include `accountEmail` when available and refresh the account authorization if necessary.

### The provider rejected the request

Check **Metrics > Logs > AI** for the provider error. Common causes include invalid keys, unavailable models, exhausted quota, rate limits, and unsupported tool or structured-output behavior.

### Classification created a pending rule

The candidate confidence may have been below the threshold, tied with another candidate, or unsupported by an existing rule. Review the rule, choose the best label, and optionally add a reason to improve future rule evidence.

### AI Draft did not use an MCP tool

Confirm MCP Client is active and the tool is selected. Add clear instructions to the relevant prompt. Tool use is model-driven and is not guaranteed.

## Related documentation

- Read [MCP Client](documentation/mcp-client) to add external tools to Emailable's AI requests.
- Read [MCP Server](documentation/mcp-server) when another application needs to call Emailable tools.
- Read [Installation](documentation/installation) for environment, Docker, Coolify, and Home Assistant setup.
