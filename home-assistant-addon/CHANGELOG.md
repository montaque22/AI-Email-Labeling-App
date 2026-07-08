# Changelog

## 0.1.76

- Changed AI Actions to show available actions for every selected custom MCP tool.
- Moved commitment created timing beside due timing in the commitment footer.

## 0.1.75

- Improved commitment urgency colors, markdown rendering, and relative due/created timing.
- Replaced commitment browser confirmations with glass app modals.
- Fixed mobile pull-to-refresh so pulling from email rows works consistently.
- Constrained the BYOAI MCP server modal so the header and footer stay accessible with long tool lists.

## 0.1.74

- Added inbox commitments with due dates, completion and renege flows, and committed-email archive/delete protection.
- Added best-effort PWA unread badge updates for browsers that support app badging.
- Improved mobile pull-to-refresh reset behavior.

## 0.1.73

- Kept the desktop AI Helper button and panel above compose/email modals.

## 0.1.72

- Increased AI Helper session history sent to the backend.
- Improved AI Helper follow-up handling so short replies answer the previous assistant question.

## 0.1.71

- Refactored BYOAI calls through the Vercel AI SDK provider abstraction.
- Converted Emailable system and selected MCP client tools into executable AI SDK tools.
- Added a one-hour session id and session-backed message history for AI Helper conversations.
- Made the AI Helper chat auto-scroll to the newest message.

## 0.1.70

- Added session-backed AI Helper chat history so follow-up replies keep context.
- Improved AI Helper autonomy with stronger agent instructions and a 10-tool-call escape hatch.
- Expanded `find_email` with state, label, read/unread, and count-aware indexed search.
- Updated MCP tool descriptions so AI providers can reason about archived, sent, draft, label, and rule queries.

## 0.1.69

- Added the desktop AI Helper chat panel with visible-email context and compose assistance.
- Updated AI Helper to use BYOAI provider tool integrations for agent-style email questions.
- Updated `find_email` to search indexed email first and provider accounts only when requested.
- Improved `query_email_rules` handling for simple field aliases such as `from` and `subject`.
- Added desktop floating Inbox actions and slide animations for selection controls.

## 0.1.68

- Fixed the mobile AI Draft screen so the header and prompt input stay pinned while the keyboard is open.
- Documented that AI Draft tool picking requires BYOAI and MCP Client activation with selected tools.

## 0.1.67

- Removed the remaining desktop modal clipping that could hide the AI Draft tool helper popup.

## 0.1.66

- Fixed the desktop AI Draft tool helper popup so it appears above the composer instead of being clipped by the modal.

## 0.1.65

- Render email HTML in the app DOM with sanitization instead of iframes so hyperlink actions work consistently.
- Improved mobile Inbox select mode so checkboxes no longer overlap message content.
- Tightened mobile Inbox row truncation to prevent horizontal text glitches.

## 0.1.64

- Added a PWA update prompt and offline/out-of-sync warning.
- Prevented API and Inbox data from being cached by the app or browser.
- Added mobile Inbox pull-to-refresh.
- Added a link action menu for hyperlinks inside rendered email messages.
- Added the Technithusiast Community link to the README.

## 0.1.63

- Added archive actions to mobile and desktop email detail views.
- Updated Inbox documentation for archive behavior.

## 0.1.62

- Added archived email browsing to the Inbox mode selector.
- Added desktop archive and icon-only compose/delete controls.
- Added a save-draft action beside Send in the compose and reply composer.

## 0.1.61

- Added database-backed email metadata indexing for labeled and sent mail.
- Updated Inbox list, label counts, and search to read indexed email metadata instead of fetching provider message lists.
- Changed Inbox deletes to remove indexed messages immediately and delete from providers in the background.

## 0.1.60

- Added Inbox search across connected accounts for To, From, and Subject matches with 1-second debounced top-result suggestions.

## 0.1.59

- Fixed manual OAuth callback completion for Home Assistant/Nabu Casa URLs that include the public add-on slug before the callback route.

## 0.1.58

- Added a Home Assistant-only OAuth recovery flow for connected email accounts.
- Saved pending provider connection attempts before OAuth redirects and added a manual callback URL completion fallback when Home Assistant intercepts the provider callback page.

## 0.1.57

- Added a frontend OAuth callback bridge for Home Assistant/Nabu Casa installs where provider redirects load the app shell instead of executing the backend callback directly.

## 0.1.56

- Limited last-page restore to mobile-sized screens so desktop opens normally while mobile/PWA sessions resume the last page.

## 0.1.55

- Added label creation options for manual entry, CSV upload, and importing existing labels or folders from connected providers.
- Added an Inbox warning when connected account tokens need refresh.
- Restored the last active page when the app is reopened from the root URL.

## 0.1.54

- Fixed Better Auth session routes when Home Assistant add-on URLs include an ingress slug path.

## 0.1.53

- Fixed Gmail account OAuth return URLs for Home Assistant add-on installs using a public add-on slug path.
- Added defensive routing for Home Assistant ingress-prefixed API requests.

## 0.1.52

- Fixed add-on URLs that include the public Home Assistant slug path, such as Nabu Casa add-on URLs.

## 0.1.51

- Fixed Home Assistant ingress API routing by injecting the add-on ingress base path into the app shell.

## 0.1.50

- Fixed Email Accounts loading for Home Assistant users without a Google SSO backing account.
- Made Email Accounts loading tolerate secondary provider or polling setting response failures.

## 0.1.49

- Redirect email account reconnect and token refresh flows back to the Email Accounts page after OAuth completes.

## 0.1.48

- Updated the mobile AI Draft prompt field to wrap and grow up to three lines before scrolling internally.

## 0.1.47

- Updated the mobile compose body field to grow with message content instead of using an inner scrollbar.

## 0.1.46

- Improved the mobile AI Draft layout with a stable bottom input bar and centered empty state guidance.

## 0.1.45

- Improved PWA install metadata and iOS home-screen icon support.
- Fixed nested route serving for PWA manifest, icon, and service worker assets.

## 0.1.44

- Fixed PWA service worker navigation so OAuth refresh/connect URLs reach the backend instead of loading the app shell.

## 0.1.43

- Added Progressive Web App support with installable app metadata, icons, and a conservative service worker.
- Improved mobile email rendering so wide HTML emails fit the screen.
- Added a mobile-friendly Email Accounts row view with a bottom action sheet for refresh and delete actions.
- Hid unconfigured OAuth email providers from the add-account provider list.

## 0.1.42

- Added Microsoft OAuth2 modern authentication for Outlook.com, Live.com, Hotmail, and Microsoft 365 accounts.
- Added OAuth-backed Microsoft IMAP access, folder management, drafts, searches, and SMTP sending.

## 0.1.41

- Added provider read/unread state to Inbox messages and a blue unread indicator beside the sender.
- Marked Gmail and IMAP messages as read when their details are opened.
- Added relative Inbox timestamps while preserving exact dates in email details.

## 0.1.40

- Fixed the desktop Inbox action/filter toolbar positioning after its glass surface overrode sticky behavior.
- Increased the sticky toolbar opacity so scrolling content no longer shows through its controls.

## 0.1.39

- Made the desktop Inbox label navigation and action/filter controls remain visible while scrolling messages.
- Added independent scrolling for long desktop label lists.

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
