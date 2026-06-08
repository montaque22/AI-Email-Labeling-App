from __future__ import annotations

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import aiohttp_client

from .api import EmailableApiClient
from .const import CONF_API_KEY, CONF_BASE_URL, DOMAIN

PLATFORMS: list[str] = []


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    session = aiohttp_client.async_get_clientsession(hass)
    client = EmailableApiClient(session, entry.data[CONF_BASE_URL], entry.data[CONF_API_KEY])
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = client

    async def get_prompts(call: ServiceCall) -> None:
        response = await client.get_prompts()
        hass.bus.async_fire(f"{DOMAIN}_response", {"action": "get_prompts", "response": response})

    async def create_draft_reply(call: ServiceCall) -> None:
        response = await client.create_draft_reply(dict(call.data))
        hass.bus.async_fire(f"{DOMAIN}_response", {"action": "create_draft_reply", "response": response})

    async def add_labels_on_email(call: ServiceCall) -> None:
        response = await client.add_labels_on_email(dict(call.data))
        hass.bus.async_fire(f"{DOMAIN}_response", {"action": "add_labels_on_email", "response": response})

    async def query_email_rules(call: ServiceCall) -> None:
        response = await client.query_email_rules(dict(call.data))
        hass.bus.async_fire(f"{DOMAIN}_response", {"action": "query_email_rules", "response": response})

    hass.services.async_register(DOMAIN, "get_prompts", get_prompts)
    hass.services.async_register(DOMAIN, "create_draft_reply", create_draft_reply, schema=CREATE_DRAFT_REPLY_SCHEMA)
    hass.services.async_register(DOMAIN, "add_labels_on_email", add_labels_on_email, schema=ADD_LABELS_ON_EMAIL_SCHEMA)
    hass.services.async_register(DOMAIN, "query_email_rules", query_email_rules, schema=QUERY_EMAIL_RULES_SCHEMA)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data[DOMAIN].pop(entry.entry_id, None)

    if not hass.data[DOMAIN]:
        for service in ["get_prompts", "create_draft_reply", "add_labels_on_email", "query_email_rules"]:
            hass.services.async_remove(DOMAIN, service)

    return True


CREATE_DRAFT_REPLY_SCHEMA = vol.Schema(
    {
        vol.Required("accountEmail"): str,
        vol.Required("emailId"): str,
        vol.Optional("bodyText", default=""): str,
        vol.Optional("bodyHtml", default=""): str,
        vol.Optional("replyAll", default=False): bool,
    }
)

ADD_LABELS_ON_EMAIL_SCHEMA = vol.Schema(
    {
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
        vol.Required("query"): dict,
        vol.Optional("limit"): vol.Coerce(int),
    }
)
