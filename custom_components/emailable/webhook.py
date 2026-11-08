"""Native Home Assistant webhook delivery for processed Emailable messages."""

from __future__ import annotations

from functools import partial
from http import HTTPStatus
import json
import logging
from typing import Any
from urllib.parse import urlparse

from aiohttp import hdrs, web

from homeassistant.components import webhook
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.network import NoURLAvailableError

from .api import EmailableApiClient
from .const import (
    CONF_INCLUDE_EMAIL_BODY,
    CONF_WEBHOOK_BASE_URL,
    CONF_WEBHOOK_ID,
    DEFAULT_INCLUDE_EMAIL_BODY,
    EVENT_EMAIL_READY,
)

_LOGGER = logging.getLogger(__name__)
_EXPECTED_EVENT = "email.ready_for_processing"
_MAX_REQUEST_BYTES = 64 * 1024


async def async_register_webhook(
    hass: HomeAssistant,
    entry: ConfigEntry,
    client: EmailableApiClient,
) -> None:
    """Register one stable webhook and publish its URL to Emailable."""
    webhook_id = entry.data.get(CONF_WEBHOOK_ID)
    if not isinstance(webhook_id, str) or not webhook_id:
        webhook_id = webhook.async_generate_id()
        hass.config_entries.async_update_entry(
            entry,
            data={**entry.data, CONF_WEBHOOK_ID: webhook_id},
        )

    webhook.async_unregister(hass, webhook_id)
    webhook.async_register(
        hass,
        "emailable",
        f"Emailable ({entry.title})",
        webhook_id,
        partial(_async_handle_webhook, config_entry_id=entry.entry_id),
        local_only=False,
        allowed_methods=(hdrs.METH_POST,),
    )

    try:
        webhook_url = _webhook_url(hass, entry, webhook_id)
        await client.register_home_assistant_webhook(
            {
                "config_entry_id": entry.entry_id,
                "webhook_url": webhook_url,
                "include_body": bool(
                    entry.options.get(
                        CONF_INCLUDE_EMAIL_BODY,
                        DEFAULT_INCLUDE_EMAIL_BODY,
                    )
                ),
            }
        )
    except Exception:
        webhook.async_unregister(hass, webhook_id)
        raise


async def async_unregister_webhook(
    hass: HomeAssistant,
    entry: ConfigEntry,
    client: EmailableApiClient,
) -> None:
    """Remove the local handler and its independently registered destination."""
    webhook_id = entry.data.get(CONF_WEBHOOK_ID)
    if isinstance(webhook_id, str) and webhook_id:
        webhook.async_unregister(hass, webhook_id)
    try:
        await client.remove_home_assistant_webhook(entry.entry_id)
    except Exception as error:  # Unload must not be blocked by an unreachable server.
        _LOGGER.warning("Could not remove Emailable webhook destination: %s", error)


async def _async_handle_webhook(
    hass: HomeAssistant,
    _webhook_id: str,
    request: web.Request,
    *,
    config_entry_id: str,
) -> web.Response:
    """Validate one event envelope and expose the stable HA event contract."""
    if request.content_length and request.content_length > _MAX_REQUEST_BYTES:
        return web.json_response(
            {"error": "Webhook payload is too large"},
            status=HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
        )
    raw_body = await request.content.read(_MAX_REQUEST_BYTES + 1)
    if len(raw_body) > _MAX_REQUEST_BYTES:
        return web.json_response(
            {"error": "Webhook payload is too large"},
            status=HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
        )
    try:
        envelope = json.loads(raw_body)
    except (UnicodeDecodeError, json.JSONDecodeError, TypeError):
        return web.json_response(
            {"error": "Webhook body must be valid JSON"},
            status=HTTPStatus.BAD_REQUEST,
        )

    event_data = _parse_event(envelope)
    if event_data is None:
        return web.json_response(
            {"error": "Unsupported or malformed Emailable event"},
            status=HTTPStatus.BAD_REQUEST,
        )
    event_data["config_entry_id"] = config_entry_id
    hass.bus.async_fire(EVENT_EMAIL_READY, event_data)
    return web.json_response({"ok": True})


def _parse_event(envelope: Any) -> dict[str, Any] | None:
    if (
        not isinstance(envelope, dict)
        or envelope.get("schema_version") != "1.0"
        or envelope.get("event_name") != _EXPECTED_EVENT
    ):
        return None
    event_id = envelope.get("event_id")
    payload = envelope.get("payload")
    if (
        not isinstance(event_id, str)
        or not event_id
        or len(event_id) > 200
        or not isinstance(payload, dict)
    ):
        return None
    email = payload.get("email")
    classification = payload.get("classification")
    if not isinstance(email, dict) or not isinstance(classification, dict):
        return None
    if not isinstance(email.get("id"), str) or not email["id"]:
        return None
    label_values = classification.get("labels", [])
    if not isinstance(label_values, list):
        return None
    labels = [
        label["name"]
        for label in label_values
        if isinstance(label, dict) and isinstance(label.get("name"), str)
    ]
    data = {
        "event_id": event_id,
        "email_id": email.get("id"),
        "thread_id": email.get("thread_id"),
        "account_id": email.get("account_id"),
        "account_email": email.get("account_email"),
        "provider": email.get("provider"),
        "sender": email.get("from"),
        "subject": email.get("subject"),
        "received_at": email.get("received_at"),
        "labels": labels,
        "classification": classification,
        "attachments": email.get("attachments")
        if isinstance(email.get("attachments"), list)
        else [],
    }
    body = email.get("body")
    if isinstance(body, dict) and isinstance(body.get("text"), str):
        data["body"] = body["text"]
    return data


def _webhook_url(hass: HomeAssistant, entry: ConfigEntry, webhook_id: str) -> str:
    configured_base = str(
        entry.options.get(
            CONF_WEBHOOK_BASE_URL,
            entry.data.get(CONF_WEBHOOK_BASE_URL, ""),
        )
        or ""
    ).strip()
    if configured_base:
        parsed = urlparse(configured_base)
        if parsed.scheme != "https" or not parsed.netloc:
            raise ValueError("The Home Assistant webhook base URL must be a public HTTPS URL")
        return f"{configured_base.rstrip('/')}{webhook.async_generate_path(webhook_id)}"
    try:
        return webhook.async_generate_url(
            hass,
            webhook_id,
            allow_internal=False,
            allow_external=True,
            prefer_external=True,
        )
    except NoURLAvailableError as error:
        raise ValueError(
            "Home Assistant has no external URL. Configure one in Home Assistant or "
            "set the Emailable webhook base URL in this integration's options."
        ) from error
