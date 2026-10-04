---
title: Rules
slug: rules
order: 13
---

# Rules

Rules are Emailable's reusable memory of how an email should be categorized. They connect message characteristics, such as sender and subject, with the label a user selected and the reason that label is appropriate.

Rules help Emailable make better future decisions, but they are not traditional provider filters that run independently inside Gmail or an IMAP server. Emailable uses rules as evidence when its AI labeling workflow processes another email.

## Why rules are created

When AI analyzes an email, it returns label candidates with confidence values and reasons. Emailable compares those candidates with the user's confidence threshold.

A pending rule is created when Emailable cannot safely choose one label, including when:

- No candidate reaches the confidence threshold.
- Two or more candidates tie for the highest confidence.
- No label candidate is supplied.
- The result needs the user to choose the best fit.

Example:

| Suggested label | Confidence | Reason |
| --- | --- | --- |
| Action Required | 0.82 | The sender requests a decision. |
| Security | 0.82 | The message also describes suspicious account access. |

With a threshold of `0.90`, neither candidate is confident enough and the values are tied. Emailable creates one pending rule containing both suggestions instead of applying an arbitrary label.

## One rule, one final label

An unreviewed rule may contain up to three suggestions because the AI was uncertain. A reviewed rule can have only one selected label.

When the rule modal opens:

- Emailable automatically selects the suggestion with the highest stored confidence.
- If the highest confidence is tied, the first suggestion is selected.
- Older rules created before per-label confidence was retained also fall back to the first stored suggestion.
- The system recommendation has a blue **Suggested** tag while the rule is pending.
- Selecting another label switches the choice like a radio button.
- Only one label can be saved as the final decision.

The suggestions are alternatives inside one rule. They do not mean Emailable intends to apply several labels to the email.

## Review a rule

1. Open **Rule Review**.
2. Select a pending rule.
3. Read the sender, subject, snippet, confidence, and suggested labels.
4. Choose the single best label.
5. Optionally explain when that label should be used.
6. Select **Reviewed**.

After a successful review, Emailable:

- Applies the selected label to the original email or moves it to the matching IMAP folder.
- Removes the email's previous Emailable category.
- Stores only the selected label as the reviewed outcome.
- Sets the rule confidence to `1`.
- Marks the rule as no longer pending.
- Closes the review modal.

The reason is optional, but adding one gives future AI requests better evidence about why the label applies. The Reviewed button visually encourages a reason while still allowing the user to continue without one.

## How rules improve future labeling

Before AI labels an email, Emailable searches the user's existing rules for similar sender and subject information. Both reviewed and pending rules can provide evidence.

Relevant rules are included as guidance for the AI. When a similar or matching rule exists, Emailable uses it to increase confidence and attempts to label the email without creating a duplicate rule.

Reviewed rules are more useful because they contain a deliberate user choice. A clear reason can help distinguish cases from the same sender, such as:

- A receipt from a store should use `Reference`.
- A payment failure from the same store should use `Action Required`.
- A suspicious login notice from the same company should use `Security`.

Rules make Emailable smarter through runtime retrieval. They do not train, fine-tune, or permanently modify the underlying OpenAI, Gemini, Anthropic, or Ollama model.

## When a rule is used

A rule does not watch the mailbox or act by itself. Something must start the AI Label workflow, such as:

- Scheduled polling.
- A manual poll.
- The AI Label REST endpoint.
- Another supported Emailable AI workflow.

The workflow finds the email, retrieves relevant rules, asks the AI for a structured decision, and then applies Emailable's confidence and validation logic.

## Review rules in bulk

Reviewing one rule at a time is slow when many pending rules share an obvious outcome. The Rule Review page can act on every selected rule at once.

Select rules with the row checkboxes or **Select all**, then choose one of:

- **Accept suggested** marks each selected pending rule reviewed using the single label it already suggests. The button shows how many of the selected rules qualify.
- **Change label** opens a label picker, applies the chosen label to every selected rule, and marks them reviewed.
- **Delete selected** removes the selected rules.

Both review actions behave exactly like reviewing each rule individually: the label is applied to the original email, the previous Emailable label is removed, confidence is set to `1`, and the rule stops being pending. Any reason already stored for the applied label is kept.

**Accept suggested** skips rules it cannot decide for the user and reports them in the result summary:

- A rule with more than one suggestion is skipped because the choice is ambiguous. Open it on its own.
- A rule with no suggestion is skipped because there is nothing to accept.
- A rule that is already reviewed is skipped because it has no pending decision.

**Change label** has no such restriction. It applies the selected label to every selected rule, including reviewed rules whose label should change.

A summary line appears above the rule list after each bulk action with the number reviewed, skipped, or failed. A rule can fail when its email is no longer reachable in the connected account or when the label was deleted, and the remaining rules still process.

Emailable works through the selected rules several at a time rather than one after another, so a large selection finishes in a fraction of the time it used to.

A bulk action also has a time limit of about 45 seconds. If a very slow email provider pushes the action past it, Emailable stops starting new rules and returns what it finished. The summary then reports the remainder as not attempted. Those rules stay selected and nothing was changed on them, so running the same action again is safe and picks up where it stopped.

## Add a rule manually

The Rule Review page includes **Add Rule** for creating a rule from an existing email.

1. Search connected accounts by subject and optionally account.
2. Select the correct email.
3. Choose one label.
4. Add an optional reason.
5. Review the rule.

Starting from an existing email lets Emailable retain the correct message ID, thread ID, sender, subject, account, and snippet without asking the user to enter provider metadata manually.

## Edit a reviewed rule

A reviewed rule remains editable. Changing its label or reason enables the review action again.

When a different label is reviewed, Emailable applies the new label to the original email and removes the old Emailable label. On an IMAP account, this moves the message to the new folder.

Editing a rule changes future guidance. Manually changing only the email's label from the Inbox does not change the rule.

## Rule confidence

Confidence is a number from `0` to `1` that represents how certain the AI was about its best suggestion.

The Rule Review page compares confidence with the current threshold:

- At or above the threshold with one unique best candidate can be labeled automatically.
- Below the threshold requires review unless relevant rule evidence allows Emailable to make a supported decision.
- Equal top values are ambiguous and create a pending rule when no relevant rule resolves the choice.
- A user-reviewed rule is stored with confidence `1` because the user supplied the final decision.

The default confidence threshold is `0.90` and can be changed under **Settings > Confidence Threshold**.

## Reasons and suggestions

Each pending suggestion can include a reason generated by AI. During review, the user keeps or edits the reason for the selected label.

A useful reason describes when the category applies:

```text
Use Security when the message reports an unknown login, suspicious activity,
password reset, one-time code, or unauthorized account access.
```

Avoid reasons that merely repeat the label name:

```text
Use this for Security.
```

The clearer reason gives future AI requests a meaningful decision boundary.

## Rule Review tools

The Rule Review page supports:

- Filtering all, pending, or reviewed rules.
- Grouping by pending status or sender email.
- Fuzzy searching loaded rules.
- Changing the number of visible rules.
- Selecting multiple rules to accept their suggested label, change their label, or delete them.
- Exporting rules to CSV.
- Opening a rule from Recent Activity on the Overview page.

Pending rules are visually distinct so users can identify decisions that still need review.

## Relationship between labels and rules

Rules reference labels by name. Emailable keeps those references consistent when labels change:

- Renaming a label updates rules that used the old name.
- Deleting a label removes it from rules that referenced it.
- A rule with no remaining valid label must be reviewed before it can provide a useful classification.

See [Labels](documentation/labels) for synchronization and provider behavior.

## Caveats

- A rule is associated with a specific source email and stores message metadata and a snippet, not a complete permanent copy of the provider email body.
- Similarity does not guarantee correctness. Messages from the same sender can have different purposes.
- Pending rules can inform AI but should still be reviewed.
- A reason improves guidance but does not guarantee that the AI will choose the same label later.
- Deleting a rule removes Emailable's stored guidance; it is different from deleting the email.
- Provider authorization must be valid when reviewing a rule because Emailable updates the source email's label or folder.
- Only one final Emailable label is allowed, even on Gmail where the provider itself supports multiple labels.

## Example lifecycle

1. Polling finds an account-alert email.
2. AI suggests `Security` at `0.86` and `Action Required` at `0.83`.
3. The confidence threshold is `0.90`, so Emailable creates a pending rule.
4. The user reviews the rule, selects `Security`, and adds a reason about unauthorized access alerts.
5. Emailable labels the original email and marks the rule reviewed.
6. A similar alert arrives later.
7. Emailable retrieves the reviewed rule as evidence, allowing the AI to classify the new message with better context.

## Related documentation

- Read [Labels](documentation/labels) for Gmail label and IMAP folder behavior.
- Read [Bring Your Own AI](documentation/bring-your-own-ai) for confidence-based labeling and polling.
