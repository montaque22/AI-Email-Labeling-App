---
title: Inbox
slug: inbox
order: 11
---

# Inbox

The Inbox is a unified mail view for the accounts you connect to Emailable. It lets you see messages from multiple providers in one place, organized by the labels or folders you created in Emailable.

Use the Inbox when you want to review mail, reply to messages, create drafts, change a message's label or folder, delete mail, or quickly see whether Emailable has already created a rule for a message.

## What the Inbox shows

Emailable stores lightweight email metadata in its database so the Inbox, search, labels, archived mail, and unread state can load quickly. It does not store full email bodies in the database. Full content is fetched from the connected provider only when you open a message or when a feature needs the body to complete an action.

The message list can show:

- Sender.
- Subject.
- Snippet.
- Received time or relative date.
- Current Emailable label or folder.
- Reply count when replies are known.
- Attachment indicator when supported.
- Unread status.
- Rule status when a related rule exists.
- Commitment status when a message has an open or completed commitment.

Unread messages show a small blue dot. Opening a message marks it as read.

## Inbox, Drafts, and Sent

The Inbox page has three views:

- **Inbox** shows received messages and excludes sent mail and drafts.
- **Drafts** shows saved draft messages.
- **Sent** shows sent messages.

Each view loads a limited number of messages per connected account first. As you reach the bottom of the list, Emailable loads more messages without replacing the messages already shown.

Draft messages open in an editable view so you can update the draft content before sending or saving changes.

## Labels and folders

The label list is based on the labels you created in Emailable.

For Gmail, Emailable works with Gmail labels. For folder-based providers, including IMAP-style accounts, Emailable treats labels as folders. When a label is selected, Emailable looks for messages that match that label or folder across the selected accounts.

The **All** category is not a real provider label. It asks Emailable to fetch messages across your Emailable labels and show them together.

Label counts are shown when practical. Some providers make exact counts expensive, so counts may be loaded lazily or may not update instantly.

## Account filters

Use the account filter to include or exclude specific connected accounts from the Inbox view.

This is useful when:

- You only want to review one mailbox.
- One account is slow or temporarily disconnected.
- You want to compare how labels behave across accounts.

When no account is selected, Emailable has no mailbox to search.

## Sorting

The Inbox supports sorting loaded messages by:

- Newest.
- Oldest.
- Sender.
- Subject.

Sorting applies to the messages currently loaded in the view. Loading more messages can add more items into the sorted list.

## Search

Inbox search uses Emailable's indexed metadata first. This keeps searches fast and allows archived messages to be included when they match the search terms.

Search can match visible message fields such as **To**, **From**, **Subject**, snippets, and label names. If a feature needs the full message body, Emailable fetches the selected message from the provider at that point.

## Open an email

Select a message to open a human-readable email view.

The detail view shows:

- Subject.
- Rule status.
- Reply count.
- From.
- To.
- CC when available.
- Date.
- Body.
- Attachments when available.

The detail view avoids raw provider metadata, raw MIME, JSON, headers, and provider IDs. HTML messages are safely rendered, and plain text messages are shown cleanly when HTML is not available.

In the detail view, the date is shown as the actual date and time. In the list view, recent messages use friendlier relative dates, such as **Yesterday**, **2 days ago**, or **3 weeks ago**.

## Rules from the Inbox

The rule status tag in an email is clickable.

- If no rule exists, it opens the create rule flow for that email.
- If a rule exists, it opens the edit rule flow.

Rules help Emailable learn how a message should be labeled. A reviewed rule means the message has a confirmed label decision. A pending rule means Emailable needs a user to choose the best label.

See [Rules](documentation/rules) for more detail about rule review.

## Change a label or folder

Use the label dropdown to change the selected message or selected messages to another Emailable label.

When you move a message to a new label:

- Emailable applies the new provider label or moves the message to the new folder.
- Emailable removes the old Emailable label when applicable.
- The message counts for affected labels are updated.
- A toast confirms success or failure.

For folder-based accounts, changing the label usually means moving the message from one folder to another.

Selecting no label removes Emailable labels from the message when supported.

## Select multiple emails

On desktop, select one or more messages and use the available bulk actions.

On mobile, press and hold a message to enter edit mode. In edit mode:

- Tapping a message selects or deselects it.
- **Select all** selects the currently loaded messages.
- **Cancel** exits edit mode.
- The floating delete action deletes selected messages.
- The label selector can change the label for selected messages.

Opening messages is disabled while edit mode is active so taps do not accidentally navigate away from the selection workflow.

## Delete emails

Deleting a message asks the provider to remove the email or move it to the provider's trash behavior.

While deletion is running, Emailable disables the affected messages and delete action and shows a loading state. After completion, the list and label counts update, and a toast confirms the result.

Provider behavior can vary. Some providers immediately move mail to Trash. Others may mark it deleted or remove it from the current folder depending on server settings.

## Archive emails

Archiving hides a message from the normal Inbox list without deleting it.

You can archive messages from:

- The bulk action bar after selecting one or more messages.
- The desktop email detail view using the archive icon between Delete and Reply.
- The mobile email detail view using the archive icon between Delete and Reply.

Archived messages can be viewed from the **Archive** category in the Inbox mode selector. Search can still include archived messages when they match the search terms.

## Compose and reply

Use **Compose** to write a new message from a connected account.

The compose view includes:

- From account.
- To.
- CC.
- BCC.
- Subject.
- Body.
- Attachments list when supported.

When replying to an email, Emailable keeps the original email available so you can reference the message while drafting. Replies are sent through the connected account when the provider supports sending.

If BYOAI is active, the compose and reply experience can include an AI Draft flow. It uses your Reply Draft prompt and the current email context, when replying, to suggest a response. You can apply a suggestion to the message body before sending.

See [Bring Your Own AI](documentation/bring-your-own-ai) for AI setup.

## AI Helper

AI Helper is a floating chat assistant available from the Inbox when BYOAI is active.

Use AI Helper when you want to ask questions about the mail you are viewing, search indexed email metadata, or get help composing a message. It keeps the visible messages and selected email in context, so you can ask questions like:

- "What is this email asking me to do?"
- "How many archived emails do I have?"
- "Find the last email from Aiper."
- "Help me write a reply."

AI Helper first works from the active screen and Emailable's indexed database. If the answer requires looking deeper through connected provider accounts, it should ask before doing the slower provider-wide search.

AI Helper keeps short-term conversation history in the browser session. That means follow-up answers such as "yes", "do that", or "use the second one" can refer to the previous assistant question while the session is active. The history is not meant to be permanent memory.

If MCP Client is active and tools are selected, AI Helper can use those tools through the configured AI provider. Tool availability depends on the BYOAI provider and the MCP tools you enabled.

## AI Draft

AI Draft helps write a new email or reply while you are in the compose or reply flow.

Use it when you know what you want to say but want help with wording, tone, or finding supporting details from email. For replies, AI Draft includes the original email as context and is instructed to respond as you, not as the sender.

You can type a plain request, such as:

- "Write a warm but concise reply."
- "Ask them to send the invoice again."
- "Find the order number from older emails and include it."

When available tools are active, the tool helper can appear while typing `#`. Selecting a tool inserts a readable tool directive into the prompt. This tells the AI that it must use that tool before drafting the response.

AI Draft returns suggested message text. You can apply the suggestion to the email body, edit it, save it as a draft, or send the email.

## AI Actions

AI Actions let Emailable use your selected custom MCP tools against the email you are viewing.

This is useful when an email should trigger an outside action, such as creating a calendar event, creating a task, adding a CRM note, sending a notification, or calling a home automation tool.

When you open AI Actions, Emailable looks at your active custom MCP tools and asks AI to create available actions from those real tools. The actions are not hard-coded. They are based on the tools you enabled in BYOAI.

The flow is:

1. Choose an available action.
2. Emailable prepares a preview of what the tool call will attempt to do.
3. You can edit the preview text if needed.
4. Confirm the action.
5. Emailable runs the MCP tool and shows a concise markdown summary of the result.

The raw MCP response can be verbose or provider-specific. Emailable logs the raw response for debugging, but the UI shows a cleaner AI-generated summary so the result is easier to understand.

Important caveats:

- AI Actions only appear when BYOAI is active and MCP Client is active.
- Only selected custom MCP tools are used for AI Actions.
- Tool descriptions and schemas matter. If you update a tool on the MCP server, use the refresh tools button in BYOAI so Emailable can reload the latest tool metadata.
- You should review previews before confirming. MCP tools can create or modify data outside Emailable.

## Commitments

Commitments help you turn an email into a clear obligation.

Use a commitment when an email represents something you need to close out, such as following up with someone, buying an item, measuring something, sending a file, or completing a task.

When you add a commitment, Emailable stores:

- What needs to be done.
- When it is due.
- When the commitment was created.
- Whether it has been completed.

Messages with active commitments are grouped at the top of the Inbox so they stay visible. A commitment card is also shown at the top of the email detail view.

Commitment urgency is color coded:

- Pale purple when more than one day remains.
- Yellow when less than 24 hours remains.
- Red when less than 8 hours remains or the commitment is overdue.
- Green after the commitment is completed.

An email with an active commitment cannot be deleted or archived until the commitment is resolved. This is intentional. It prevents action items from disappearing before you decide what happened.

You can resolve a commitment in two ways:

- **Complete** confirms the commitment is done and archives the email.
- **Renege** removes the commitment data and returns the email to the normal Inbox flow.

Completed commitments remain marked in the database. A completed commitment cannot be reopened, edited, or deleted from that message. If you need a new commitment later, use a different email.

## Attachments

The Inbox shows attachments simply:

- Filename.
- Type when available.
- Size when available.
- Download or open action when the provider integration supports it.

Advanced previews and attachment editing are intentionally limited for now.

## Mobile behavior

On smaller screens, the Inbox changes to a compact mail-style layout.

Mobile view:

- Hides the full sidebar and uses the hamburger menu.
- Shows Inbox, Drafts, and Sent as compact categories.
- Moves filters into a filter drawer.
- Places compose in a floating action button.
- Uses press-and-hold for multi-select.
- Opens email detail and compose as push views instead of large desktop modals.

This keeps the Inbox usable on phones while preserving the same underlying actions.

## Privacy Mode

Privacy Mode masks visible email addresses in the interface. It is useful for screen sharing or recording.

Privacy Mode does not change what connected providers, endpoints, logs, webhooks, AI providers, or MCP tools can access. It only changes what is displayed on screen.

## Performance notes

The Inbox is designed to stay fast by:

- Reading lightweight indexed email metadata for list views.
- Loading more messages only when needed.
- Fetching full message content only when a message is opened.
- Avoiding storage of full email bodies in Emailable's database.

Large mailboxes, many connected accounts, slow IMAP servers, provider rate limits, or enabled AI tooling can still affect response time.

## Important notes

- The Inbox depends on connected account permissions. If an account needs refresh, messages from that account may fail to load.
- Gmail labels and folder-based providers do not behave exactly the same. Emailable presents them as one label system for consistency.
- Changing labels from outside Emailable can make local label mappings stale. Use label refresh and sync if counts or actions look wrong.
- Drafts, sent mail, delete, and attachment support depend on what each provider allows.
- Provider rate limits still apply.

## Related documentation

- Read [Email Accounts](documentation/email-accounts) to connect and refresh mailboxes.
- Read [Labels](documentation/labels) to understand labels, folders, and sync behavior.
- Read [Rules](documentation/rules) to understand rule review and label decisions.
- Read [Polling](documentation/polling) to let Emailable process new mail automatically.
