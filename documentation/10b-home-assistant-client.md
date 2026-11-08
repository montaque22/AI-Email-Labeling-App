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

It also checks Emailable every 15 seconds for newly processed-email events. This is an outbound connection from Home Assistant; no public Home Assistant webhook or inbound port is required.

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

### Processed-email events

When Emailable finishes its internal classification decision, the integration fires:

```text
emailable_email_ready
```

The event includes `event_id`, `email_id`, `thread_id`, `account_id`, `account_email`, `provider`, `sender`, `subject`, `received_at`, `labels`, `classification`, `attachments`, and `config_entry_id`. Attachment content, raw headers, HTML, and callback secrets are never placed on the Home Assistant event bus.

Plain-text email bodies are excluded by default. To include a bounded plain-text body, open the Emailable integration's **Configure** options and enable **Include plain-text email body in events**. Email content may then be retained by Home Assistant's recorder and exposed to automations.

Basic trigger:

```yaml
triggers:
  - trigger: event
    event_type: emailable_email_ready
```

Filter one connected account and label:

```yaml
conditions:
  - condition: template
    value_template: >-
      {{ trigger.event.data.account_email == 'family@example.com'
         and 'Appointments and Events' in trigger.event.data.labels }}
```

The integration stores an opaque cursor and resumes after ordinary restarts or temporary network failures. Emailable retains event-feed payloads for 14 days by default. If Home Assistant remains offline longer, the integration logs a warning and resumes from the oldest retained event.

Delivery is at least once. A restart after an event fires but before its cursor is saved may deliver that event again. Automations with non-idempotent side effects should derive a stable operation ID from `event_id` or keep their own deduplication state.

### Report an external outcome

After a Home Assistant operation finishes, optionally report its outcome with:

- `emailable.activity_completed`
- `emailable.activity_failed`

Emailable records only reported outcomes. There is intentionally no Started action, pending state, timeout, or supervision of the Home Assistant workflow.

Use a stable `activity_id`, normally the event ID plus the operation name. Different operations on the same email must use different activity IDs. Repeating an identical report is safe; reporting a contradictory result for the same activity ID is rejected.

Appointment example:

```yaml
alias: Add appointments found by Emailable
triggers:
  - trigger: event
    event_type: emailable_email_ready
conditions:
  - condition: template
    value_template: "{{ 'Appointments and Events' in trigger.event.data.labels }}"
actions:
  - action: calendar.create_event
    target:
      entity_id: calendar.family
    data:
      summary: "{{ trigger.event.data.subject }}"
      start_date_time: "{{ now().replace(hour=18, minute=0, second=0).isoformat() }}"
      end_date_time: "{{ now().replace(hour=19, minute=0, second=0).isoformat() }}"
  - action: emailable.activity_completed
    data:
      config_entry_id: "{{ trigger.event.data.config_entry_id }}"
      event_id: "{{ trigger.event.data.event_id }}"
      activity_id: "calendar_{{ trigger.event.data.event_id }}"
      title: Calendar event created
      description: Appointment added to the family calendar
      data:
        calendar: calendar.family
```

Explicit failure branch:

```yaml
actions:
  - choose:
      - conditions:
          - condition: template
            value_template: "{{ states('calendar.family') in ['unknown', 'unavailable'] }}"
        sequence:
          - action: emailable.activity_failed
            data:
              config_entry_id: "{{ trigger.event.data.config_entry_id }}"
              event_id: "{{ trigger.event.data.event_id }}"
              activity_id: "calendar_{{ trigger.event.data.event_id }}"
              title: Calendar event creation failed
              description: The family calendar was unavailable
              error:
                code: CALENDAR_UNAVAILABLE
                message: Calendar entity was unavailable
    default:
      - action: calendar.create_event
        target:
          entity_id: calendar.family
        data:
          summary: "{{ trigger.event.data.subject }}"
          start_date_time: "{{ now().replace(hour=18, minute=0, second=0).isoformat() }}"
          end_date_time: "{{ now().replace(hour=19, minute=0, second=0).isoformat() }}"
      - action: emailable.activity_completed
        data:
          config_entry_id: "{{ trigger.event.data.config_entry_id }}"
          event_id: "{{ trigger.event.data.event_id }}"
          activity_id: "calendar_{{ trigger.event.data.event_id }}"
          title: Calendar event created
          description: Appointment added to the family calendar
```

Home Assistant does not automatically catch an arbitrary failed action and call `activity_failed`. Arrange an explicit failure branch when the workflow can detect its own failure.

### Action responses

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

