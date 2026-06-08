# Deployment

## Coolify

The existing Coolify deployment can continue using the Node/Nixpacks flow:

- Build command: `npm run build`
- Start command: `npm run start`
- Port: `3000`

Required environment variables:

- `DATABASE_URL`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET`
- `APP_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Optional email OAuth overrides:

- `GOOGLE_EMAIL_CLIENT_ID`
- `GOOGLE_EMAIL_CLIENT_SECRET`
- `EMAIL_ACCOUNT_TOKEN_SECRET`

## Docker

Build and run:

```bash
docker build -t emailable .
docker run --env-file .env.local -p 3000:3000 emailable
```

## Home Assistant Add-on

This repo includes a Home Assistant add-on wrapper in `home-assistant-addon/`.

The add-on exposes the app through Home Assistant Ingress and includes configuration inputs for the app environment variables. For OAuth redirects, set `APP_URL` and `BETTER_AUTH_URL` to the externally reachable Home Assistant Ingress/app URL used by the browser.

The frontend includes a runtime base-path helper for Home Assistant Ingress. It rewrites root-relative `/api/...` and `/mcp` calls to the current ingress path.

## Home Assistant Custom Integration

The `custom_components/emailable/` integration exposes Home Assistant actions:

- `emailable.get_prompts`
- `emailable.create_draft_reply`
- `emailable.add_labels_on_email`
- `emailable.query_email_rules`

Install it by adding this GitHub repo to HACS as a custom repository with category `Integration`. Configure the integration with the app base URL and an Emailable API key from the app's Endpoints page.

The same repo can be added twice in Home Assistant:

- Add-on Store repository: installs and runs the Emailable app.
- HACS custom integration repository: installs Home Assistant actions for an Emailable app instance.
