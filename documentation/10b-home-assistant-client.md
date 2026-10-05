---
title: Home Assistant Client
slug: home-assistant-client
order: 10.2
---

# Home Assistant Client

Emailable can work with Home Assistant in two different ways.

The recommended setup for most users is:

- Run Emailable once on a VPS, Docker host, Coolify, or another always-on server.
- Install the Emailable HACS integration in Home Assistant.
- Point the HACS integration at the Emailable server URL and an API key created by that server.

This makes Home Assistant a client of your main Emailable app. You do not need to reconnect email accounts, recreate labels, configure AI platforms, or rebuild MCP settings inside Home Assistant.

## Why use the HACS client

Use the HACS integration when you already have Emailable running somewhere else and want Home Assistant to access it.

This is useful when:

- Your VPS or Coolify deployment is the main Emailable app you use every day.
- You want Home Assistant actions without duplicating setup.
- You want Home Assistant automations to send email, query prompts, label emails, or use Emailable data.
- You want Emailable to keep doing the heavy work while Home Assistant stays focused on automations.

## What the HACS integration does

The HACS integration does not run a second Emailable server. It connects to an existing Emailable server.

After setup, Home Assistant can expose actions such as:

- Send an email through a connected Emailable account.
- Fetch core content such as labels and prompts.
- Create draft replies.
- Add labels or create pending review rules.
- Query email rules.

The integration can also expose connected Emailable email accounts as Home Assistant entities. Those entities make it easier to choose the correct sending account in Home Assistant actions.

## What the HACS integration does not do

The HACS integration does not replace the Emailable app.

It does not:

- Store your Gmail, IMAP, AI, or MCP credentials inside Home Assistant.
- Poll your email accounts directly.
- Run Emailable's database or background workers.
- Duplicate labels, rules, or prompts.

Those stay in the Emailable server you connect to.

## Setup with a VPS or Coolify Emailable server

1. Open your Emailable app in the browser.
2. Go to **Settings > Endpoints**.
3. Copy the server URL shown in the Home Assistant setup section.
4. Create an API key. A name like `Home Assistant` is recommended.
5. Copy the API key immediately. It is only shown once.
6. In Home Assistant, install the Emailable integration from HACS.
7. Restart Home Assistant if HACS asks you to.
8. Go to **Settings > Devices & services**.
9. Add the **Emailable** integration.
10. Paste the Emailable server URL.
11. Paste the API key.

Home Assistant validates the URL and key during setup. If validation fails, confirm that Home Assistant can reach the URL and that the key has not been revoked.

## Setup with the local Home Assistant add-on

The add-on is still useful when you want everything local.

In that setup:

- The add-on runs the full Emailable server inside Home Assistant.
- The HACS integration can connect to that local server.
- The server URL is the add-on's direct web/API URL, not the Home Assistant sidebar ingress URL.

For example:

```text
http://homeassistant.local:3000
```

or:

```text
http://10.0.0.165:3000
```

Use the port configured in the add-on's Network section.

## Choosing remote versus local

| Setup | Best for |
| --- | --- |
| VPS / Docker / Coolify server plus HACS integration | A primary Emailable install that Home Assistant can use remotely. |
| Home Assistant add-on plus HACS integration | A fully local install where Home Assistant hosts Emailable. |
| Home Assistant add-on only | Opening the Emailable app from the Home Assistant sidebar, without extra HA actions. |

## Sending email from Home Assistant

After the HACS integration is configured, use the `emailable.send_email` action.

Example:

```yaml
action: emailable.send_email
data:
  accountEntity: sensor.emailable_user_example_com
  to: person@example.com
  subject: Home Assistant test
  bodyFormat: markdown
  body: |
    ## Hello

    This email was sent from **Home Assistant** through Emailable.
```

You can use either:

- `accountEntity`: easiest when Home Assistant has loaded Emailable account entities.
- `accountEmail`: manual fallback using the exact connected account email address.

The body can be:

- `plain_text`
- `markdown`
- `html`

Markdown is converted into email-friendly HTML with a plain-text fallback.

## Events and responses

When a Home Assistant action completes, the integration fires an event named:

```text
emailable_response
```

The event includes the action name and the response returned by the Emailable server.

Use this if you want an automation to react after Emailable completes an action.

## Troubleshooting

If setup fails:

- Confirm the URL opens from the Home Assistant machine, not only from your laptop.
- Use the root Emailable app URL, not an individual endpoint path.
- Make sure the URL includes `https://` or `http://`.
- Create a fresh API key in **Settings > Endpoints** and try again.
- Check **Metrics > Logs > Endpoints** in Emailable to see whether Home Assistant is reaching the server.

If account entities do not show up:

- Confirm connected email accounts exist in Emailable.
- Reload the Emailable integration in Home Assistant after adding new email accounts.
- The action can still use `accountEmail` manually even if entities are not available.

