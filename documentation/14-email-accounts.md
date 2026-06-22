---
title: Email Accounts
slug: email-accounts
order: 14
---

# Email Accounts

Email Accounts are the mailboxes Emailable can read and manage on your behalf. Connecting an account allows Emailable to find messages, synchronize labels or folders, create drafts, send replies, and show mail in the unified Inbox.

Use this page when you want to add another mailbox, reconnect an account whose authorization expired, or confirm that an account is ready for automation.

## Supported account types

Emailable currently supports:

| Account type | How it connects | How Emailable organizes mail |
| --- | --- | --- |
| Gmail | Google OAuth | Gmail labels |
| Yahoo | Yahoo OAuth | Yahoo folders |
| IMAP | Server settings and an app password | Mail folders |

Gmail supports multiple labels on a message, while folder-based accounts normally place a message in one folder. Emailable keeps its own behavior consistent by choosing one Emailable label or folder when it classifies a message.

## Add an account

1. Open **Settings > Email Accounts**.
2. Select **Add Email Account**.
3. Choose Gmail, Yahoo, or IMAP.
4. Complete the provider sign-in or enter the requested IMAP settings.
5. Return to Emailable and confirm that the account shows **Connected**.

When a new account is connected, Emailable attempts to create or match the labels and folders that already exist in your Emailable label list. If a matching label already exists at the provider, Emailable stores its provider ID instead of creating a duplicate.

## Gmail and Yahoo authorization

Gmail and Yahoo open the provider's own sign-in and consent screen. Emailable does not receive the account password. The provider returns access and refresh credentials that let Emailable perform the actions you approved.

For Gmail, approve the mailbox permission requested by Emailable. Signing in to the Emailable application with Google is not the same as connecting that Gmail mailbox for email management. The application login proves who you are; the mailbox connection grants permission to read and modify mail.

If an account says it is missing the required scope, use its refresh action and approve the requested permission. Emailable cannot synchronize labels or process messages with a login-only permission.

## Connect an IMAP account

Choose IMAP for providers that do not have a dedicated connection in Emailable.

You will need:

- The email address and optional display name.
- IMAP server host and port.
- Whether the server requires TLS.
- The IMAP username.
- An app password or provider-issued mail password.
- The Inbox, Sent, and Drafts folder names used by the provider.

Use an app password instead of the account's primary password whenever the provider supports one. Some providers require IMAP to be enabled in account settings before a connection can succeed.

IMAP settings and folder names vary by provider. Consult the provider's current documentation if Emailable cannot find the Inbox, Sent, or Drafts folder.

## Account status

Emailable checks connected account authorization when the Email Accounts page loads. Use **Recheck accounts** to run the check again.

Common statuses include:

- **Connected**: Emailable can currently access the mailbox.
- **Refresh required**: The provider credentials expired, were revoked, or no longer include a required permission.
- **Connection error**: Emailable could not reach or authenticate with the mail server.

The refresh icon remains available for OAuth accounts. For IMAP, reconnect the account with current server settings and an active app password.

## Remove an account

Use the red trash icon to disconnect a removable account. This removes Emailable's connection and stops future actions against that mailbox. It does not delete the mailbox or its messages at the provider.

An account used as a required sign-in identity may not be removable from this page. Connect another account when you need Emailable to work with more than one mailbox.

## When accounts are used

Connected accounts are used by:

- The unified Inbox, Drafts, and Sent views.
- Label and folder synchronization.
- Email labeling and relabeling.
- Draft creation and email replies.
- AI Label and AI Reply.
- Polling.
- REST endpoints and MCP tools that find or modify email.

When an account email is provided in an API request, Emailable uses it to search one mailbox directly. When it is omitted, Emailable may search all connected accounts, which can take longer.

## Important notes

- Provider tokens and IMAP credentials are secrets. Do not place them in source control or automation payloads.
- Provider permissions can be revoked outside Emailable. Recheck the account after changing provider security settings or passwords.
- OAuth redirects require the public Emailable application URL to match the redirect URL configured with the provider.
- Provider rate limits still apply. Connecting several accounts or searching a large lookback can increase response time.
- Privacy Mode only masks email addresses in the interface. It does not change what connected providers or enabled AI workflows can access.

