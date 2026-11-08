from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.helpers import aiohttp_client

from .api import EmailableApiClient
from .const import (
    CONF_API_KEY,
    CONF_BASE_URL,
    CONF_INCLUDE_EMAIL_BODY,
    CONF_WEBHOOK_BASE_URL,
    DEFAULT_BASE_URL,
    DEFAULT_INCLUDE_EMAIL_BODY,
    DOMAIN,
)


class EmailableConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    @staticmethod
    def async_get_options_flow(config_entry):
        return EmailableOptionsFlow()

    async def async_step_user(self, user_input=None):
        errors = {}

        if user_input is not None:
            base_url = user_input[CONF_BASE_URL].rstrip("/")
            api_key = user_input[CONF_API_KEY].strip()
            webhook_base_url = user_input.get(CONF_WEBHOOK_BASE_URL, "").strip().rstrip("/")

            try:
                session = aiohttp_client.async_get_clientsession(self.hass)
                client = EmailableApiClient(session, base_url, api_key)
                await client.get_prompts()
            except Exception:
                errors["base"] = "cannot_connect"
            else:
                return self.async_create_entry(
                    title=f"Emailable ({base_url})",
                    data={
                        CONF_BASE_URL: base_url,
                        CONF_API_KEY: api_key,
                        CONF_WEBHOOK_BASE_URL: webhook_base_url,
                    },
                )

        schema = vol.Schema(
            {
                vol.Required(CONF_BASE_URL, default=DEFAULT_BASE_URL): str,
                vol.Required(CONF_API_KEY): str,
                vol.Optional(CONF_WEBHOOK_BASE_URL, default=""): str,
            }
        )

        return self.async_show_form(step_id="user", data_schema=schema, errors=errors)

    async def async_step_reauth(self, entry_data):
        self._reauth_entry = self.hass.config_entries.async_get_entry(
            self.context["entry_id"]
        )
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(self, user_input=None):
        errors = {}
        if user_input is not None and self._reauth_entry is not None:
            api_key = user_input[CONF_API_KEY].strip()
            try:
                session = aiohttp_client.async_get_clientsession(self.hass)
                client = EmailableApiClient(
                    session,
                    self._reauth_entry.data[CONF_BASE_URL],
                    api_key,
                )
                await client.get_prompts()
            except Exception:
                errors["base"] = "cannot_connect"
            else:
                return self.async_update_reload_and_abort(
                    self._reauth_entry,
                    data_updates={CONF_API_KEY: api_key},
                )

        return self.async_show_form(
            step_id="reauth_confirm",
            data_schema=vol.Schema({vol.Required(CONF_API_KEY): str}),
            errors=errors,
        )


class EmailableOptionsFlow(config_entries.OptionsFlow):
    async def async_step_init(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_INCLUDE_EMAIL_BODY,
                        default=self.config_entry.options.get(
                            CONF_INCLUDE_EMAIL_BODY,
                            DEFAULT_INCLUDE_EMAIL_BODY,
                        ),
                    ): bool,
                    vol.Optional(
                        CONF_WEBHOOK_BASE_URL,
                        default=self.config_entry.options.get(
                            CONF_WEBHOOK_BASE_URL,
                            self.config_entry.data.get(CONF_WEBHOOK_BASE_URL, ""),
                        ),
                    ): str,
                }
            ),
        )
