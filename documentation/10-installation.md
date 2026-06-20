---
title: Installation
slug: installation
order: 10
---

# Installation

Emailable can run directly with Node.js, in Docker, on Coolify, or as a Home Assistant add-on.

## Requirements

- Node.js `22.12.0` or newer.
- PostgreSQL.
- npm.
- Docker when using a container-based installation.
- OAuth client IDs and secrets for the providers you want to enable.

## Environment variables

Create `.env.local` for local development or configure the same values in your deployment platform.

```bash
DATABASE_URL=<postgres-connection-string>
PORT=3000
APP_URL=http://127.0.0.1:3000
BETTER_AUTH_URL=http://127.0.0.1:3000
BETTER_AUTH_SECRET=replace-with-a-strong-random-secret

GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret

EMAIL_ACCOUNT_TOKEN_SECRET=replace-with-a-strong-random-secret-for-email-account-tokens

# Optional Yahoo OAuth connection
YAHOO_CLIENT_ID=your-yahoo-oauth-client-id
YAHOO_CLIENT_SECRET=your-yahoo-oauth-client-secret
```

Use externally reachable URLs in production:

```bash
APP_URL=https://your-domain.example
BETTER_AUTH_URL=https://your-domain.example
```

Generate a secret with:

```bash
openssl rand -base64 32
```

## Run locally with npm

1. Install dependencies.

```bash
npm install
```

2. Start the local PostgreSQL database.

```bash
docker compose up -d postgres
```

The included `docker-compose.yml` uses `postgres` as the local development database password.

3. Copy the local environment example and fill in the OAuth values.

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

Open `http://127.0.0.1:3000`.

To use another port outside Home Assistant, set `PORT` and update `APP_URL` and `BETTER_AUTH_URL` to the same origin. For example:

```bash
PORT=8080
APP_URL=http://127.0.0.1:8080
BETTER_AUTH_URL=http://127.0.0.1:8080
```

Useful local commands:

```bash
npm run dev:server
npm run db:studio
npm run build
```

## Run with Docker

Build the application image:

```bash
docker build -t emailable .
```

Run it with an environment file:

```bash
docker run --env-file .env.local -p 3000:3000 emailable
```

When overriding the container listener, publish the same port, for example `PORT=8080` with `-p 8080:8080`.

If you also need local PostgreSQL:

```bash
docker compose up -d postgres
docker run --env-file .env.local -p 3000:3000 emailable
```

For Docker on the same host, make sure `DATABASE_URL` points to an address the container can reach. On Docker Desktop, use `host.docker.internal` instead of `127.0.0.1` when appropriate.

## Deploy with Coolify

Connect the GitHub repository to a Coolify application and use:

- Build Pack: Nixpacks.
- Build command: `npm run build`.
- Start command: `npm run start`.
- Port: `3000`.
- Static site: disabled.

Configure these environment variables in Coolify:

- `DATABASE_URL`.
- `APP_URL`.
- `BETTER_AUTH_URL`.
- `BETTER_AUTH_SECRET`.
- `GOOGLE_CLIENT_ID`.
- `GOOGLE_CLIENT_SECRET`.
- `EMAIL_ACCOUNT_TOKEN_SECRET`.
- Optional Yahoo variables listed above.

After changing database or authentication settings, run:

```bash
npm run auth:migrate
```

## Home Assistant add-on

This repository includes the Home Assistant add-on wrapper in `home-assistant-addon/`.

The add-on:

- Runs the same Node app on port `3000`.
- Uses Home Assistant Ingress and appears in the sidebar.
- Creates a separate Emailable data scope for each authenticated Home Assistant user.
- Includes a bundled PostgreSQL database when no external `DATABASE_URL` is supplied.
- Pulls prebuilt images from GitHub Container Registry when available.

Install it with these steps:

1. In Home Assistant, open Settings > Add-ons > Add-on Store.
2. Open the menu and add this GitHub repository URL as an add-on repository.
3. Install the Emailable add-on.
4. Open the add-on Configuration tab.
5. Fill in the required application and OAuth values.
6. Start the add-on.
7. Open Emailable from the Home Assistant sidebar.

The add-on configuration is grouped into Basic Configuration and Optional / Advanced Configuration.

- `APP_URL`: the externally reachable URL OAuth providers use to return to Emailable.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: the Google OAuth client used for login and Gmail connections.
- `BETTER_AUTH_URL`: may be left blank to use `APP_URL`.
- `BETTER_AUTH_SECRET`: generated and persisted automatically when left blank.
- `DATABASE_URL`: may be left blank to use bundled PostgreSQL.
- `YAHOO_CLIENT_ID` and `YAHOO_CLIENT_SECRET`: required only for Yahoo OAuth.
- `NODE_ENV`: use `production` unless developing the add-on.

Changing `DATABASE_URL` switches databases. Existing data is not migrated automatically between bundled and external PostgreSQL databases.

### Faster Home Assistant updates

The add-on uses prebuilt images from:

```text
ghcr.io/montaque22/emailable-{arch}
```

When changes are pushed to `main`, the GitHub Actions workflow builds images for `amd64`, `aarch64`, and `armv7`. The GHCR package must be public so Home Assistant can pull it.

For each release:

1. Increment the version in `home-assistant-addon/config.yaml`.
2. Push to `main`.
3. Wait for the Build Home Assistant Add-on Images workflow.
4. Reload the add-on repository or check for updates in Home Assistant.
5. Select Update.

## HACS integration and Home Assistant actions

The repository can also be added to HACS as a custom Integration repository. This installs `custom_components/emailable` and exposes Home Assistant actions that call an Emailable app instance.

1. Install HACS.
2. Open HACS > Integrations.
3. Open Custom repositories.
4. Add this GitHub repository URL as an Integration.
5. Install Emailable and restart Home Assistant.
6. Add the Emailable integration from Settings > Devices & services.
7. Provide the Emailable base URL and API key.

The add-on and HACS integration are separate:

- The add-on runs the Emailable application.
- The HACS integration adds Home Assistant actions that call Emailable.

## MCP server

The MCP Streamable HTTP endpoint is `/mcp`.

Open Settings > MCP Server in Emailable to see the full runtime URL and create bearer tokens. MCP clients authenticate with:

```http
Authorization: Bearer <token>
```

## Google OAuth setup

1. Open Google Cloud Console and create or select a project.
2. Configure the OAuth consent screen.
3. Create an OAuth Client ID for a Web application.
4. Add authorized JavaScript origins:

```text
http://127.0.0.1:3000
https://your-production-domain.example
```

5. Add Better Auth redirect URIs:

```text
http://127.0.0.1:3000/api/auth/callback/google
https://your-production-domain.example/api/auth/callback/google
```

6. Add Gmail account connection redirects:

```text
http://127.0.0.1:3000/api/email-accounts/callback/gmail
https://your-production-domain.example/api/email-accounts/callback/gmail
```

7. Save the client ID and secret as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

Gmail label operations require `https://www.googleapis.com/auth/gmail.modify`. During development, add test users to the consent screen. Public use may require Google verification.

## Yahoo OAuth setup

1. Create an application in Yahoo Developer Network.
2. Add callback URIs:

```text
http://127.0.0.1:3000/api/email-accounts/callback/yahoo
https://your-production-domain.example/api/email-accounts/callback/yahoo
```

3. Save the credentials as `YAHOO_CLIENT_ID` and `YAHOO_CLIENT_SECRET`.

Yahoo accounts can alternatively use generic IMAP with a Yahoo app password.

## IMAP setup

Add an IMAP account from Settings > Email Accounts > Add Email Account > IMAP. Provide the email address, IMAP host, port, username, app password, and mailbox names.

Helpful setup pages:

- [Gmail IMAP](https://support.google.com/mail/answer/7126229?hl=en).
- [Yahoo app passwords](https://help.yahoo.com/kb/generate-manage-rd-party-passwords-sln15241.html).
- [Outlook.com IMAP settings](https://support.microsoft.com/en-gb/office/pop-imap-and-smtp-settings-for-outlook-com-d088b986-291d-42b8-9564-9c414e2aa040).

Common defaults:

```text
Gmail host: imap.gmail.com
Yahoo host: imap.mail.yahoo.com
Outlook host: outlook.office365.com
Port: 993
SSL/TLS: enabled
```

IMAP app passwords are encrypted before being stored. Emailable treats IMAP folders as its label and folder abstraction.

## Database health

When the server is running, open `http://127.0.0.1:3000/api/db/health`.

If the response says `DATABASE_URL` is not configured, check `.env.local`, the Docker environment, Coolify variables, or Home Assistant add-on configuration.

## Security notes

- Never commit `.env`, `.env.local`, OAuth secrets, database URLs containing passwords, or API tokens.
- Run Better Auth migrations when the authentication schema changes.
- Both Docker and npm production paths serve the built `dist/` frontend through the Node server.
