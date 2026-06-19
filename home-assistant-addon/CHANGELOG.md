# Changelog

## 0.1.19

- Added automatic per-user Emailable accounts for authenticated Home Assistant Ingress users.
- Added configurable AI email polling with interval and lookback validation.
- Added polling support for Gmail labels, Yahoo OAuth/IMAP folders, generic IMAP folders, and retrying Unemailable messages.

## 0.1.18

- Fixed Google authentication from Home Assistant by opening OAuth in the top-level browser instead of the ingress iframe.
- Return users to the active Home Assistant ingress page after authentication.

## 0.1.17

- Switched Home Assistant installs and updates to prebuilt GHCR images.
- Added reusable architecture-specific Docker build caches for faster image publishing.

## 0.1.16

- Added mobile Inbox press-and-hold selection with glass checkboxes and bulk actions.
- Added disabled loading states for messages while deletion is in progress.
- Updated Inbox label changes to remove prior Emailable labels and move IMAP messages between folders.
- Fixed Gmail replies so they remain attached to the original thread.
- Added chronological conversation threads to mobile and desktop email detail views.

## 0.1.15

- Added a mobile-optimized Inbox experience with a fixed header, filter drawer, label picker, floating compose action, and compact message rows.
- Added iOS-style mobile push views for reading, replying to, and composing email.
- Improved email detail actions with icon buttons, clickable rule status tags, and reply count shortcuts.
- Improved mobile rule review with a compact single-label selector and validation for legacy multi-label rules.
- Updated tooltips to use the glass visual style and adaptive sizing.
- Improved Inbox loading feedback, label handling, AI/MCP behavior, and email rule workflows.

## 0.1.14

- Added unified Inbox support for connected accounts.
- Added Artificial Intelligence configuration, BYOAI providers, MCP client options, and AI-assisted endpoints.
- Added metrics, logging, webhook, prompt, email-account, and rule-review improvements.
