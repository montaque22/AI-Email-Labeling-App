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

# Optional separate OAuth app for connected Gmail accounts.
GOOGLE_EMAIL_CLIENT_ID=optional-separate-google-email-oauth-client-id
GOOGLE_EMAIL_CLIENT_SECRET=optional-separate-google-email-oauth-client-secret

# Optional provider connections.
MICROSOFT_CLIENT_ID=your-microsoft-oauth-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-oauth-client-secret
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

Basic install path:

1. Push this repo to GitHub.
2. In Home Assistant, go to Settings > Add-ons > Add-on Store.
3. Open the menu and add this repository URL.
4. Install the `Emailable` add-on.
5. Open the add-on Configuration tab.
6. Fill in the environment variable fields.
7. Start the add-on.
8. Open the app from the Home Assistant sidebar.

For OAuth redirects in Home Assistant, set:

```text
APP_URL=<the externally reachable app URL>
BETTER_AUTH_URL=<the same externally reachable app URL>
```

Home Assistant Ingress serves the frontend behind an internal base path. The frontend includes a runtime helper that rewrites `/api/...` and `/mcp` calls to the correct Ingress path when the app is opened from the sidebar.

Important packaging note: the current add-on Dockerfile is designed to build with the repository root as the Docker build context. If your Home Assistant build flow only uses the `home-assistant-addon/` folder as the Docker context, publish the root Docker image to a registry such as GHCR and point the add-on config at that image.

## Home Assistant Actions

The `custom_components/emailable/` folder contains a custom integration scaffold. It exposes Home Assistant actions for:

- `emailable.get_prompts`
- `emailable.create_draft_reply`
- `emailable.add_labels_on_email`
- `emailable.query_email_rules`

To use it:

1. Copy `custom_components/emailable` into your Home Assistant `custom_components` folder.
2. Restart Home Assistant.
3. Add the Emailable integration.
4. Provide the app base URL and an Emailable API key.

Create API keys inside Emailable from the Endpoints or MCP Server settings pages, depending on the client you are configuring.

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

If you create a separate Google OAuth app for connected Gmail accounts, use:

```text
GOOGLE_EMAIL_CLIENT_ID
GOOGLE_EMAIL_CLIENT_SECRET
```

Gmail label operations require Gmail API scopes such as `https://www.googleapis.com/auth/gmail.modify`. If Google blocks access for external users, add test users during development or complete the required Google verification process.

### Microsoft

Use Microsoft Entra admin center.

1. Create an app registration.
2. Add a web redirect URI:

```text
http://127.0.0.1:3000/api/email-accounts/callback/microsoft
https://your-production-domain.example/api/email-accounts/callback/microsoft
```

3. Create a client secret.
4. Configure delegated Microsoft Graph permissions needed by your email workflow.
5. Set:

```text
MICROSOFT_CLIENT_ID
MICROSOFT_CLIENT_SECRET
```

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

Yahoo provider support is scaffolded in configuration, but provider-specific email operations may need more implementation before feature parity with Gmail.

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
