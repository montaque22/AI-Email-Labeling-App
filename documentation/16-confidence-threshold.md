---
title: Confidence Threshold
slug: confidence-threshold
order: 16
---

# Confidence Threshold

The Confidence Threshold controls how certain Emailable's AI must be before it labels an email automatically. It is the main balance between automation and human review.

Use a higher threshold when a wrong label would be costly. Use a lower threshold when faster automation matters more and occasional corrections are acceptable.

## How it works

The AI can suggest up to three possible labels, each with a confidence value from `0.01` to `1`. Emailable compares the best suggestion with your threshold.

- A single highest suggestion at or above the threshold can be applied automatically.
- If no suggestion reaches the threshold, Emailable creates a pending rule for review.
- If two suggestions tie for the highest confidence, Emailable creates a pending rule instead of choosing arbitrarily.
- Existing relevant rules can provide additional guidance and help Emailable label similar messages without creating duplicate rules.

The threshold is written as a decimal. For example, `0.90` means 90 percent confidence. Do not enter `90`.

## Choose a threshold

| Threshold | Expected behavior |
| --- | --- |
| `0.95` | Very conservative. More messages may require review. |
| `0.90` | Recommended starting point. |
| `0.80` | More aggressive automation. |
| `0.70` | High automation with a higher risk of incorrect labels. |

The default is `0.90`.

There is no universally correct value. Start at `0.90`, review the rules Emailable creates, and adjust after you understand how your prompts, labels, and email patterns perform.

## Change the threshold

1. Open **Settings > Confidence Threshold**.
2. Enter a value from `0.01` through `1`.
3. Select **Save**.
4. Confirm that the success message appears.

Both the browser and server reject values outside the allowed range.

## Where it is used

The threshold affects classification performed through:

- Polling.
- The AI Label endpoint.
- The label-classification REST endpoint.
- The Add Labels MCP tool.

It does not control AI Reply or AI Draft, because those features generate text rather than choose a label.

The `{confidenceThreshold}` prompt template is replaced with the current numeric value whenever Emailable renders supported prompts or core content. Changing the setting therefore updates future rendered prompts without requiring you to edit the template.

## Important notes

- Changing the threshold affects future decisions. It does not relabel previously processed email.
- Lowering the threshold can reduce pending rules but increases the chance of an incorrect automatic classification.
- Raising the threshold can improve caution but creates more work in Rule Review.
- A reviewed rule is stored as a confirmed decision and is not made pending again merely because the threshold changes.
- Label quality and prompt clarity matter as much as the numeric threshold. Labels with overlapping descriptions can produce ties even at a low threshold.

