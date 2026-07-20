---
title: Labels
slug: labels
order: 12
---

# Labels

Labels are Emailable's categories for organizing email. A label has a name and an optional description that explains what belongs in the category.

Examples include:

- `Action Required` for messages that need a response or decision.
- `Invoice` for bills, invoices, and payment requests.
- `Security` for password resets, login alerts, and account-access warnings.
- `Reference` for useful information that does not require action.

Labels are the common language Emailable uses across connected accounts, AI prompts, rules, the Inbox, endpoints, and MCP tools.

## Labels and folders

Email providers do not all organize mail the same way.

| Account type | How Emailable applies a category |
| --- | --- |
| Gmail | Applies a Gmail label. |
| IMAP account | Moves the message into the corresponding IMAP folder. |

Gmail technically allows several labels on one message, while folder-based providers normally place a message in one folder. Emailable uses one best-fit Emailable category per message so behavior remains consistent across providers.

On Gmail, changing an Emailable label removes the message's previous Emailable labels and applies the new one. Labels that are not managed by Emailable, such as provider system labels, are not intended to be removed.

On an IMAP account, changing the label moves the message from its previous Emailable folder into the new folder.

## What happens when a label is created

When a user creates a label, Emailable:

1. Validates the name and description.
2. Saves the label as part of the user's Emailable configuration.
3. Attempts to create the matching label or folder in every connected email account.
4. Stores the provider-specific label or folder ID returned by each account.
5. Tracks whether each account synchronized successfully.

If the same label or folder already exists in an email account, Emailable reuses its provider ID instead of creating a duplicate.

When a new email account is connected later, Emailable attempts to create or match all existing labels for that account automatically.

## Create a label

1. Open **Labels**.
2. Select the **+** button in the Labels section.
3. Choose **Add Manually**.
4. Enter a name.
5. Add a clear description of when the label should be used.
6. Save the label.

Label validation rules are:

- Name is required.
- Name can contain letters, numbers, spaces, hyphens, and underscores.
- Name can be up to 25 characters.
- Description can be up to 200 characters.

Descriptions matter when BYOAI is used. The `{labelTable}` prompt template includes synchronized label names and descriptions, giving the AI guidance about the intended meaning of each category.

## Write useful descriptions

A useful description explains the decision boundary, not only the label name.

Weak description:

```text
Security emails.
```

Clearer description:

```text
Password resets, one-time codes, login alerts, suspicious activity warnings,
account recovery, and unauthorized access notifications.
```

Descriptions should help distinguish similar categories. For example, explain when a message belongs in `Action Required` instead of `Reference`.

## Import labels from CSV

Use CSV import when you want to add several new Emailable labels at once.

1. Open **Labels**.
2. Select the **+** button.
3. Choose **Upload CSV**.
4. Review the example table in the modal.
5. Choose a `.csv` file.

The CSV must use these exact headers:

```csv
Name,Description
Action Required,"Emails that need a response, decision, or follow-up."
Reference,"Useful information that does not require action."
```

The CSV can contain up to 20 data rows. Emailable validates every row before storing anything. If one row fails validation, the entire import is rejected so the account is not left with a partial import.

## Choose labels from providers

Use **Choose from Providers** when labels or folders already exist in one or more connected email accounts and you want Emailable to adopt them.

1. Open **Labels**.
2. Select the **+** button.
3. Choose **Choose from Providers**.
4. Review the labels and folders found in connected accounts.
5. Select the labels you want Emailable to manage.
6. Add descriptions for the selected labels.
7. Import the selected labels.

The provider list is gathered from all connected accounts. Gmail accounts contribute Gmail user labels. IMAP-style accounts contribute folders.

If a provider label already exists in Emailable, it is shown but disabled. This prevents duplicate Emailable labels while still making it clear that the provider label was found.

If a selected label exists in one connected account but not another, Emailable saves the label in its own database and then syncs it to accounts where it is missing. For example, if `Receipts` already exists in Gmail Account A but not Gmail Account B, importing it tells Emailable to manage `Receipts` and create or match it in Gmail Account B during synchronization.

Provider import still uses the same label validation rules as manual creation. The name must fit Emailable's allowed characters and length, and the description can be up to 200 characters.

## Synced and unsynced labels

The Labels page separates synchronized and unsynchronized labels.

A label is fully synchronized when every connected email account has a valid provider label or folder ID for it. A label is unsynchronized when one or more accounts failed, changed, or no longer contain the expected label or folder.

Use **Refresh** to ask Emailable to check provider state. Refresh detects cases such as:

- A label was renamed directly in Gmail.
- A folder was deleted directly from an IMAP account.
- A stored provider ID is no longer valid.
- A newly connected account does not yet have all labels.

When unsynchronized labels exist, use the synchronization action to repair them. Emailable treats its saved label names and descriptions as the source of truth. It recreates missing provider labels or folders and updates stored provider IDs when necessary.

## What happens when a label changes

Renaming a label updates Emailable's label record, attempts to rename or synchronize it with connected accounts, and updates email rules that referenced the old name.

Because provider updates can fail, check the synchronization state after a rename. Common causes include expired account authorization, missing Gmail permissions, IMAP connection errors, or provider-specific naming restrictions.

## What happens when a label is deleted

Deleting a label is permanent. Emailable warns the user before continuing.

Deletion affects more than the Labels page:

- The label is removed from Emailable.
- References to the label are removed from email rules.
- Emailable attempts to remove the label from messages that use it.
- Emailable attempts to remove the provider label or folder from connected accounts.

If the provider label was already deleted directly from the account, Emailable treats that missing provider object as already removed and continues deleting the Emailable label.

Review rules that used a deleted label because they may no longer have a usable recommendation.

## Applying labels manually

In the Inbox, selecting a different label immediately changes the message's Emailable category. This changes or moves the email but does not rewrite an associated rule.

Selecting no label removes Emailable-managed categories from the message.

If the email has a rule and the user wants future similar messages handled differently, edit the rule instead of only changing the email's current label.

## Labels used by AI

When BYOAI is active, Emailable limits AI classification to labels that exist in the user's label database. Matching is case-insensitive during validation, but the stored label name is normalized to the exact spelling used in Emailable.

The AI can recommend up to three candidates when uncertain, but Emailable ultimately applies only one category. See [Rules](documentation/rules) for the review process.

## Hidden system label

Emailable maintains a hidden `Unemailable` system label or folder for messages it could not process safely. It can be used when AI providers fail, no legal label can be applied, or another processing error occurs.

The hidden label is not returned as a normal user category and should not be used as a classification choice. Polling may retry messages with this label later. When a valid label is successfully applied, Emailable removes `Unemailable`.

## Caveats

- Provider authorization must remain valid for synchronization and label changes.
- Gmail connections need the required modify scope.
- IMAP providers may have folder-name restrictions that differ from Emailable's validation.
- A synchronized label count depends on all currently connected accounts.
- Changing a message's label manually does not automatically change its rule.
- Labels organize messages; they do not start polling or AI processing by themselves.

## Related documentation

- Read [Rules](documentation/rules) to understand pending recommendations and reviewed decisions.
- Read [Bring Your Own AI](documentation/bring-your-own-ai) to use labels in AI classification and polling.
