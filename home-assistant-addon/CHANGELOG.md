# Changelog

## 0.1.38

- Added an aggregate All category to the Inbox label navigation.
- Replaced manual Inbox pagination with infinite scrolling and a responsive skeleton loading row.

## 0.1.37

- Added the Emailable icon and logo to the HACS custom integration brand assets.

## 0.1.36

- Fixed the desktop documentation table of contents below the application header so it remains visible while reading long pages.

## 0.1.35

- Added user-focused documentation for Metrics and Logs, Email Accounts, Polling, Webhooks, Endpoints, and Confidence Thresholds.
- Documented feature setup, practical use cases, security considerations, limits, and troubleshooting guidance.

## 0.1.34

- Made the desktop documentation table of contents sticky, viewport-bounded, and independently scrollable.
- Added a mobile header control and right-side documentation table-of-contents drawer.

## 0.1.33

- Added Labels documentation covering cross-provider behavior, synchronization, validation, imports, and lifecycle effects.
- Added Rules documentation covering confidence, pending suggestions, single-label review, and runtime rule learning.

## 0.1.32

- Added Bring Your Own AI documentation covering providers, fallbacks, prompts, polling, AI endpoints, drafting, privacy, cost, and reliability.
- Clarified which Emailable features remain available without BYOAI.

## 0.1.31

- Added MCP Client documentation covering BYOAI tool expansion, setup, provider caveats, token usage, and security.
- Documented how MCP Client activation disables the external MCP Server and revokes its keys.

## 0.1.30

- Added in-app documentation for configuring, securing, and using the Emailable MCP Server.
- Added MCP tool payload examples, Home Assistant networking guidance, and troubleshooting steps.

## 0.1.29

- Added validated `PORT` environment-variable support for standalone Node installations.
- Exposed the Home Assistant host-facing port in Network configuration while preserving the fixed ingress listener.

## 0.1.28

- Keep rule review action tooltips within the modal and viewport bounds.

## 0.1.27

- Changed rule label selection to radio-style switching while retaining glass checkbox visuals.
- Added a Suggested tag to pending rules and automatic selection of the highest-confidence suggestion.

## 0.1.26

- Close the rule review modal automatically after a successful review.

## 0.1.25

- Removed the nested scrollbar and fixed height from available-label lists in rule editors.

## 0.1.24

- Improved the rule review modal with fixed actions, one scrollable content area, and background scroll locking.
- Added existing-rule retrieval to AI labeling so matching rules guide classification without creating duplicates.
- Added provider-native structured output schemas for AI label responses.
- Normalized missing provider snippets so scheduled polling can continue processing messages.

## 0.1.23

- Added an in-app Markdown documentation center with routed pages and a table of contents.
- Added Home and Installation documentation.
- Simplified the repository README and added the Emailable video overview.

## 0.1.22

- Added seven-day system log retention on startup and daily cleanup.
- Added background log export with automatic browser download.
- Added confirmation-based deletion of all user logs.

## 0.1.21

- Corrected Create Rule and Edit Rule modal titles.
- Replaced rule label dropdowns and drag-and-drop controls with responsive full-width label rows.
- Added glass checkboxes, single-label enforcement, and selected-row highlighting to rule editors.

## 0.1.20

- Added manual polling with a cooldown, aggregate polling webhooks, and Email activity logs.
- Added editable Gmail and IMAP drafts and rejected empty provider drafts.
- Improved Inbox row interaction and moved Polling Save to the section footer.

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
