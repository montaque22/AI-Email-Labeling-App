from __future__ import annotations

from datetime import datetime, timezone

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import aiohttp_client

from .api import EmailableApiClient
from .const import (
    CONF_API_KEY,
    CONF_BASE_URL,
    CONF_CONFIG_ENTRY_ID,
    DATA_CLIENTS,
    DATA_FEEDS,
    DATA_SERVICES_REGISTERED,
    DOMAIN,
)
from .event_feed import EmailableEventFeed

PLATFORMS: list[str] = ["sensor"]
SERVICES = [
    "get_prompts",
    "create_draft_reply",
    "add_labels_on_email",
    "query_email_rules",
    "send_email",
    "activity_completed",
    "activity_failed",
]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    session = aiohttp_client.async_get_clientsession(hass)
    client = EmailableApiClient(session, entry.data[CONF_BASE_URL], entry.data[CONF_API_KEY])
    domain_data = hass.data.setdefault(
        DOMAIN,
        {DATA_CLIENTS: {}, DATA_FEEDS: {}, DATA_SERVICES_REGISTERED: False},
    )
    domain_data[DATA_CLIENTS][entry.entry_id] = client
    if not domain_data[DATA_SERVICES_REGISTERED]:
        _async_register_services(hass)
        domain_data[DATA_SERVICES_REGISTERED] = True
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    feed = EmailableEventFeed(hass, entry, client)
    domain_data[DATA_FEEDS][entry.entry_id] = feed
    await feed.async_start()
    entry.async_on_unload(entry.add_update_listener(_async_reload_entry))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    domain_data = hass.data[DOMAIN]
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if not unload_ok:
        return False

    feed = domain_data[DATA_FEEDS].pop(entry.entry_id, None)
    if feed:
        await feed.async_stop()

    domain_data[DATA_CLIENTS].pop(entry.entry_id, None)

    if not domain_data[DATA_CLIENTS]:
        for service in SERVICES:
            hass.services.async_remove(DOMAIN, service)
        hass.data.pop(DOMAIN, None)

    return True


async def _async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


def _async_register_services(hass: HomeAssistant) -> None:
    async def call_client(call: ServiceCall, action: str) -> None:
        client, payload = _resolve_client(hass, call)
        method = getattr(client, action)
        response = await method(payload) if payload else await method()
        hass.bus.async_fire(f"{DOMAIN}_response", {"action": action, "response": response})

    async def get_prompts(call: ServiceCall) -> None:
        await call_client(call, "get_prompts")

    async def create_draft_reply(call: ServiceCall) -> None:
        await call_client(call, "create_draft_reply")

    async def add_labels_on_email(call: ServiceCall) -> None:
        await call_client(call, "add_labels_on_email")

    async def query_email_rules(call: ServiceCall) -> None:
        await call_client(call, "query_email_rules")

    async def send_email(call: ServiceCall) -> None:
        client, payload = _resolve_client(hass, call)
        account_entity = payload.pop("accountEntity", "")
        if account_entity and not payload.get("accountEmail"):
            state = hass.states.get(account_entity)
            if state:
                payload["accountEmail"] = state.attributes.get("email") or state.state
        response = await client.send_email(payload)
        hass.bus.async_fire(f"{DOMAIN}_response", {"action": "send_email", "response": response})

    async def activity_completed(call: ServiceCall) -> None:
        await _async_report_activity(hass, call, "completed")

    async def activity_failed(call: ServiceCall) -> None:
        await _async_report_activity(hass, call, "failed")

    hass.services.async_register(DOMAIN, "get_prompts", get_prompts, schema=ENTRY_SCHEMA)
    hass.services.async_register(DOMAIN, "create_draft_reply", create_draft_reply, schema=CREATE_DRAFT_REPLY_SCHEMA)
    hass.services.async_register(DOMAIN, "add_labels_on_email", add_labels_on_email, schema=ADD_LABELS_ON_EMAIL_SCHEMA)
    hass.services.async_register(DOMAIN, "query_email_rules", query_email_rules, schema=QUERY_EMAIL_RULES_SCHEMA)
    hass.services.async_register(DOMAIN, "send_email", send_email, schema=SEND_EMAIL_SCHEMA)
    hass.services.async_register(DOMAIN, "activity_completed", activity_completed, schema=ACTIVITY_COMPLETED_SCHEMA)
    hass.services.async_register(DOMAIN, "activity_failed", activity_failed, schema=ACTIVITY_FAILED_SCHEMA)


def _resolve_client(hass: HomeAssistant, call: ServiceCall) -> tuple[EmailableApiClient, dict]:
    payload = dict(call.data)
    entry_id = payload.pop(CONF_CONFIG_ENTRY_ID, "")
    clients: dict[str, EmailableApiClient] = hass.data[DOMAIN][DATA_CLIENTS]
    if entry_id:
        client = clients.get(entry_id)
        if client is None:
            raise ServiceValidationError("The selected Emailable configuration is not loaded")
        return client, payload
    if len(clients) != 1:
        raise ServiceValidationError(
            "Select config_entry_id when more than one Emailable server is configured"
        )
    return next(iter(clients.values())), payload


async def _async_report_activity(hass: HomeAssistant, call: ServiceCall, status: str) -> None:
    client, fields = _resolve_client(hass, call)
    payload = {
        "schema_version": "1.0",
        "event_id": fields["event_id"],
        "activity_id": fields["activity_id"],
        "status": status,
        "source": "Home Assistant",
        "title": fields["title"],
        "description": fields.get("description", ""),
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "data": fields.get("data", {}),
    }
    if status == "failed" and fields.get("error") is not None:
        payload["error"] = fields["error"]
    response = await client.report_activity(payload)
    hass.bus.async_fire(f"{DOMAIN}_response", {"action": f"activity_{status}", "response": response})


ENTRY_FIELDS = {vol.Optional(CONF_CONFIG_ENTRY_ID, default=""): str}
ENTRY_SCHEMA = vol.Schema(ENTRY_FIELDS)

CREATE_DRAFT_REPLY_SCHEMA = vol.Schema(
    {
        **ENTRY_FIELDS,
        vol.Required("accountEmail"): str,
        vol.Required("emailId"): str,
        vol.Optional("bodyText", default=""): str,
        vol.Optional("bodyHtml", default=""): str,
        vol.Optional("replyAll", default=False): bool,
    }
)

ADD_LABELS_ON_EMAIL_SCHEMA = vol.Schema(
    {
        **ENTRY_FIELDS,
        vol.Required("emailId"): str,
        vol.Required("threadId"): str,
        vol.Required("fromEmail"): str,
        vol.Required("fromName"): str,
        vol.Required("subject"): str,
        vol.Required("snippet"): str,
        vol.Required("confidence"): vol.Coerce(float),
        vol.Required("labelsApplied"): [str],
    }
)

QUERY_EMAIL_RULES_SCHEMA = vol.Schema(
    {
        **ENTRY_FIELDS,
        vol.Required("query"): dict,
        vol.Optional("limit"): vol.Coerce(int),
    }
)

SEND_EMAIL_SCHEMA = vol.Schema(
    {
        **ENTRY_FIELDS,
        vol.Optional("accountEntity", default=""): str,
        vol.Optional("accountEmail", default=""): str,
        vol.Required("to"): vol.Any(str, [str]),
        vol.Optional("cc", default=""): vol.Any(str, [str]),
        vol.Optional("bcc", default=""): vol.Any(str, [str]),
        vol.Required("subject"): str,
        vol.Required("body"): str,
        vol.Optional("bodyFormat", default="plain_text"): vol.In(["plain_text", "markdown", "html"]),
    }
)

ACTIVITY_COMMON_FIELDS = {
    **ENTRY_FIELDS,
    vol.Required("event_id"): str,
    vol.Required("activity_id"): str,
    vol.Required("title"): str,
    vol.Optional("description", default=""): str,
    vol.Optional("data", default=dict): dict,
}

ACTIVITY_COMPLETED_SCHEMA = vol.Schema(ACTIVITY_COMMON_FIELDS)
ACTIVITY_FAILED_SCHEMA = vol.Schema(
    {
        **ACTIVITY_COMMON_FIELDS,
        vol.Optional("error"): dict,
    }
)
