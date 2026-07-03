---
title: Inbox
slug: inbox
order: 11
---

# Inbox

The Inbox is a unified mail view for the accounts you connect to Emailable. It lets you see messages from multiple providers in one place, organized by the labels or folders you created in Emailable.

Use the Inbox when you want to review mail, reply to messages, create drafts, change a message's label or folder, delete mail, or quickly see whether Emailable has already created a rule for a message.

## What the Inbox shows

Emailable fetches messages from your connected providers on demand. It does not store full email bodies in the database.

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

Where available, Emailable prefers provider-side search because it avoids downloading unnecessary messages.

For messages already loaded into the page, Emailable can also search visible message fields such as sender, subject, snippet, and label name.

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

- Fetching message lists on demand.
- Loading a small batch per account first.
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
