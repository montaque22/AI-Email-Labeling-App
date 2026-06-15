# Emailable

Emailable is a web app for managing AI-assisted email labeling workflows. It lets users sign in, connect email accounts, create synced labels, review AI-generated email rules, manage confidence thresholds, edit reusable AI prompts, call integration APIs, and expose selected tools through MCP and Home Assistant actions.

This documentation is intentionally setup-focused. Product and user documentation can be expanded later.

## What It Runs

- React + Vite frontend
- Express Node.js API server
- PostgreSQL database
- Better Auth for application login
- OAuth connections for email providers
- MCP Streamable HTTP endpoint at `/mcp`
- Optional Home Assistant add-on and custom integration scaffolding

## Requirements

- Node.js `22.12.0` or newer
- PostgreSQL
- npm
- Docker, if using the Docker workflow
- OAuth client IDs/secrets for the providers you want to enable

## Environment Variables

Create `.env.local` for local development or configure these values in your deployment platform.

```bash
DATABASE_URL=<postgres-connection-string>
APP_URL=http://127.0.0.1:3000
BETTER_AUTH_URL=http://127.0.0.1:3000
BETTER_AUTH_SECRET=replace-with-a-strong-random-secret

GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret

EMAIL_ACCOUNT_TOKEN_SECRET=replace-with-a-strong-random-secret-for-email-account-tokens

# Optional Yahoo OAuth connection.
YAHOO_CLIENT_ID=your-yahoo-oauth-client-id
YAHOO_CLIENT_SECRET=your-yahoo-oauth-client-secret
```

Use different URL values in production:

```bash
APP_URL=https://your-domain.example
BETTER_AUTH_URL=https://your-domain.example
```

Generate secrets with a command like:

```bash
openssl rand -base64 32
```

## Run Locally With npm

1. Install dependencies.

```bash
npm install
```

2. Start the local Postgres database.

```bash
docker compose up -d postgres
```

The included `docker-compose.yml` uses `postgres` as the local development database password.

3. Copy the local example env file and fill in OAuth values.

```bash
cp .env.local.example .env.local
```

4. Run the Better Auth migration.

```bash
npm run auth:migrate
```

5. Build the frontend.

```bash
npm run build
```

6. Start the Node server.

```bash
npm run start
```

Open:

```text
http://127.0.0.1:3000
```

Useful local commands:

```bash
npm run dev:server
npm run db:studio
npm run build
```

## Run With Docker

Build the application image:

```bash
docker build -t emailable .
```

Run it with an env file:

```bash
docker run --env-file .env.local -p 3000:3000 emailable
```

If you also need local Postgres:

```bash
docker compose up -d postgres
docker run --env-file .env.local -p 3000:3000 emailable
```

For Docker on the same host, make sure `DATABASE_URL` points somewhere the container can reach. On Docker Desktop, that may be `host.docker.internal` instead of `127.0.0.1`.

## Deploy With Coolify

The existing Coolify setup can continue to use the Node/Nixpacks flow.

Recommended settings:

- Build Pack: Nixpacks
- Build command: `npm run build`
- Start command: `npm run start`
- Port: `3000`
- Static site: disabled

Set the environment variables in Coolify:

- `DATABASE_URL`
- `APP_URL`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `EMAIL_ACCOUNT_TOKEN_SECRET`
- Optional provider variables listed above

After changing database/auth settings, run the auth migration from Coolify terminal or a one-off shell:

```bash
npm run auth:migrate
```

## Home Assistant Add-on

This repo includes an add-on wrapper in `home-assistant-addon/`.

The add-on:

- Runs the same Node app on port `3000`
- Enables Home Assistant Ingress
- Shows Emailable in the Home Assistant sidebar
- Provides add-on configuration fields for the app environment variables
- Pulls prebuilt images from GitHub Container Registry when available, so Home Assistant does not need to compile the app locally

Basic install path:

1. Push this repo to GitHub.
2. In Home Assistant, go to Settings > Add-ons > Add-on Store.
3. Open the menu and add this GitHub repository URL as an add-on repository.
4. Install the `Emailable` add-on.
5. Open the add-on Configuration tab.
6. Fill in the environment variable fields.
7. Start the add-on.
8. Open the app from the Home Assistant sidebar.

### Faster Home Assistant Updates

The add-on is configured to use prebuilt images:

```text
ghcr.io/montaque22/emailable-{arch}
```

When changes are pushed to `main`, the GitHub Actions workflow in `.github/workflows/home-assistant-addon-image.yml` builds and publishes images for `amd64`, `aarch64`, and `armv7`. After that workflow finishes, Home Assistant can update by pulling the matching image instead of rebuilding the Node app on the Home Assistant device.

For this to work, the GHCR package must be public. If the image package is private, Home Assistant will not be able to pull it without registry credentials and may fall back to a slow local build or fail the update.

When releasing an add-on update:

1. Increment `home-assistant-addon/config.yaml` `version`.
2. Push to `main`.
3. Wait for the `Build Home Assistant Add-on Images` workflow to finish.
4. In Home Assistant, reload the add-on repository or check for updates.
5. Click Update.

For OAuth redirects in Home Assistant, set:

```text
APP_URL=<the externally reachable app URL>
BETTER_AUTH_URL=<the same externally reachable app URL>
```

Home Assistant Ingress serves the frontend behind an internal base path. The frontend includes a runtime helper that rewrites `/api/...` and `/mcp` calls to the correct Ingress path when the app is opened from the sidebar.

The add-on configuration is grouped into two sections:

- `Basic Configuration`: common values for the app URL and Google OAuth.
- `Optional / Advanced Configuration`: generated secrets, external database override, Yahoo OAuth, and development mode.

The common values are:

- `APP_URL`: Public URL where OAuth providers can reach Emailable.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: One Google OAuth client used for both app login and Gmail connection.

The optional values are:

- `BETTER_AUTH_URL`: Leave blank to use `APP_URL`.
- `BETTER_AUTH_SECRET`: If left blank, the add-on generates one and stores it in `/data/better_auth_secret`.
- `DATABASE_URL`: Leave blank to use the bundled Postgres database.
- `YAHOO_CLIENT_ID` and `YAHOO_CLIENT_SECRET`: Only needed for Yahoo OAuth.
- `NODE_ENV`: Use `production` unless developing the add-on.

`DATABASE_URL` is optional for the Home Assistant add-on. If it is left blank, the add-on starts a bundled Postgres database and stores its files under `/data/postgres`. Advanced users can still provide an external Postgres connection string.

Changing `DATABASE_URL` after first use switches which database Emailable uses. Existing data is not migrated automatically between the bundled database and an external database.

Yahoo OAuth fields are optional unless you want Yahoo account connection through OAuth. Generic IMAP accounts do not require Yahoo OAuth credentials.

## HACS Integration and Home Assistant Actions

The same GitHub repository can also be added to HACS as a custom integration repository. This installs `custom_components/emailable` automatically, so users do not need to manually copy files into Home Assistant.

The custom integration exposes Home Assistant actions for:

- `emailable.get_prompts`
- `emailable.create_draft_reply`
- `emailable.add_labels_on_email`
- `emailable.query_email_rules`

HACS install path:

1. Install HACS if it is not already installed.
2. In Home Assistant, open HACS > Integrations.
3. Open the menu and choose Custom repositories.
4. Add this GitHub repository URL.
5. Set the repository category to `Integration`.
6. Install `Emailable`.
7. Restart Home Assistant.
8. Add the Emailable integration from Settings > Devices & services.
9. Provide the app base URL and an Emailable API key.

Create API keys inside Emailable from the Endpoints or MCP Server settings pages, depending on the client you are configuring.

The add-on and the HACS integration are separate installs:

- Add-on Store repository: runs the Emailable Node app inside Home Assistant.
- HACS integration repository: installs the Home Assistant actions that call an Emailable app instance.

For a full Home Assistant setup, add this same GitHub repo URL in both places.

## MCP Server

The MCP Streamable HTTP endpoint is:

```text
/mcp
```

In the app, go to Settings > MCP Server to see the full runtime URL and create bearer tokens for MCP clients.

Clients should authenticate with:

```http
Authorization: Bearer <token>
```

## OAuth Setup

### Google

Use Google Cloud Console to create OAuth credentials.

1. Go to Google Cloud Console.
2. Create or select a project.
3. Configure the OAuth consent screen.
4. Create an OAuth Client ID.
5. Choose Web application.
6. Add authorized JavaScript origins:

```text
http://127.0.0.1:3000
https://your-production-domain.example
```

7. Add redirect URIs for Better Auth:

```text
http://127.0.0.1:3000/api/auth/callback/google
https://your-production-domain.example/api/auth/callback/google
```

8. If using Gmail account connections, also add the app callback used by the email account flow:

```text
http://127.0.0.1:3000/api/email-accounts/callback/gmail
https://your-production-domain.example/api/email-accounts/callback/gmail
```

9. Copy the client ID and secret into:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
```

Gmail label operations require Gmail API scopes such as `https://www.googleapis.com/auth/gmail.modify`. If Google blocks access for external users, add test users during development or complete the required Google verification process.

### Yahoo

Use Yahoo Developer Network.

1. Create an OAuth application.
2. Add redirect URI:

```text
http://127.0.0.1:3000/api/email-accounts/callback/yahoo
https://your-production-domain.example/api/email-accounts/callback/yahoo
```

3. Set:

```text
YAHOO_CLIENT_ID
YAHOO_CLIENT_SECRET
```

Yahoo OAuth account connection is kept for users who prefer Yahoo authorization. Users can also add Yahoo through the generic IMAP setup with a Yahoo app password.

### IMAP

IMAP accounts are added directly in the app from Settings > Email Accounts > Add Email Account > IMAP. Users provide their email address, IMAP host, port, username, app password, and mailbox names.

Helpful setup pages:

- Gmail IMAP: `https://support.google.com/mail/answer/7126229?hl=en`
- Yahoo app passwords: `https://help.yahoo.com/kb/generate-manage-rd-party-passwords-sln15241.html`
- Outlook.com IMAP settings: `https://support.microsoft.com/en-gb/office/pop-imap-and-smtp-settings-for-outlook-com-d088b986-291d-42b8-9564-9c414e2aa040`

Common IMAP defaults:

```text
Gmail host: imap.gmail.com
Yahoo host: imap.mail.yahoo.com
Outlook host: outlook.office365.com
Port: 993
SSL/TLS: enabled
```

IMAP app passwords are encrypted before being stored in the database. The app uses IMAP folders as the label/folder abstraction for synced labels and email moves.

## Database Health

When the server is running, check:

```text
http://127.0.0.1:3000/api/db/health
```

If this reports that `DATABASE_URL` is not configured, check your `.env.local`, Docker env file, Coolify environment variables, or Home Assistant add-on configuration.

## Notes

- Do not commit `.env`, `.env.local`, OAuth secrets, database URLs with passwords, or API tokens.
- The app creates and updates several database tables at server startup, and Better Auth migrations should be run when auth schema changes.
- The Docker image and npm start path both serve the built `dist/` frontend through the Node server.
