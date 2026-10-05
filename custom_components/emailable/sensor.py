from __future__ import annotations

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .api import EmailableApiClient
from .const import DOMAIN


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    client: EmailableApiClient = hass.data[DOMAIN][entry.entry_id]

    try:
        data = await client.get_email_accounts()
    except Exception:
        data = {"accounts": []}

    accounts = data.get("accounts", []) if isinstance(data, dict) else []
    async_add_entities(
        [
            EmailableEmailAccountSensor(entry.entry_id, account)
            for account in accounts
            if isinstance(account, dict) and account.get("email")
        ]
    )


class EmailableEmailAccountSensor(SensorEntity):
    _attr_icon = "mdi:email-outline"

    def __init__(self, entry_id: str, account: dict) -> None:
        self._account = account
        email = str(account.get("email", ""))
        provider = str(account.get("provider", "email"))
        account_id = str(account.get("id") or email)
        self._attr_name = f"Emailable {email}"
        self._attr_unique_id = f"{entry_id}_{account_id}"
        self._attr_native_value = email
        self._attr_extra_state_attributes = {
            "email": email,
            "provider": provider,
            "display_name": account.get("displayName") or email,
        }

