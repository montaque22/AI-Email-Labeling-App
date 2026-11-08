"""Durable Emailable event polling for Home Assistant."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .api import (
    EmailableApiClient,
    EmailableAuthenticationError,
    EmailableRateLimitError,
    EmailableTransientError,
)
from .const import (
    CONF_INCLUDE_EMAIL_BODY,
    DEFAULT_INCLUDE_EMAIL_BODY,
    EVENT_EMAIL_READY,
    EVENT_PAGE_LIMIT,
    EVENT_POLL_INTERVAL_SECONDS,
)

_LOGGER = logging.getLogger(__name__)
_STORAGE_VERSION = 1
_MAX_PAGES_PER_CYCLE = 10


class EmailableEventFeed:
    """Poll Emailable's retained event feed and publish HA events."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        client: EmailableApiClient,
    ) -> None:
        self._hass = hass
        self._entry = entry
        self._client = client
        self._store = Store(
            hass,
            _STORAGE_VERSION,
            f"emailable_event_feed_{entry.entry_id}",
        )
        self._cursor: str | None = None
        self._initialized = False
        self._stop = asyncio.Event()
        self._task: asyncio.Task[None] | None = None

    async def async_start(self) -> None:
        """Start exactly one poller for this config entry."""
        if self._task and not self._task.done():
            return
        stored = await self._store.async_load()
        if isinstance(stored, dict) and stored.get("initialized") is True:
            self._cursor = stored.get("cursor") if isinstance(stored.get("cursor"), str) else None
            self._initialized = True
        self._stop.clear()
        self._task = self._hass.async_create_task(
            self._async_run(),
            f"emailable-event-feed-{self._entry.entry_id}",
        )

    async def async_stop(self) -> None:
        """Stop polling without closing Home Assistant's shared HTTP session."""
        self._stop.set()
        if not self._task:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None

    async def _async_run(self) -> None:
        backoff = EVENT_POLL_INTERVAL_SECONDS
        while not self._stop.is_set():
            try:
                if not self._initialized:
                    await self._async_initialize_at_latest()
                else:
                    await self._async_poll_cycle()
                backoff = EVENT_POLL_INTERVAL_SECONDS
            except EmailableAuthenticationError:
                _LOGGER.error("Emailable rejected the API key; reauthentication is required")
                await self._entry.async_start_reauth(self._hass)
                return
            except EmailableRateLimitError as error:
                _LOGGER.warning("Emailable event polling was rate limited: %s", error)
                backoff = min(max(backoff * 2, 30), 300)
            except EmailableTransientError as error:
                _LOGGER.warning("Emailable event polling will retry after a temporary error: %s", error)
                backoff = min(max(backoff * 2, 30), 300)
            except asyncio.CancelledError:
                raise
            except Exception:
                _LOGGER.exception("Unexpected Emailable event-feed error")
                backoff = min(max(backoff * 2, 30), 300)

            try:
                await asyncio.wait_for(self._stop.wait(), timeout=backoff)
            except TimeoutError:
                pass

    async def _async_initialize_at_latest(self) -> None:
        response = await self._client.fetch_events(
            cursor="latest",
            include_body=self._include_body,
            limit=EVENT_PAGE_LIMIT,
        )
        self._cursor = _optional_string(response.get("next_cursor"))
        self._initialized = True
        await self._async_save_cursor()
        _LOGGER.debug("Initialized Emailable event feed at the latest retained event")

    async def _async_poll_cycle(self) -> None:
        for _page in range(_MAX_PAGES_PER_CYCLE):
            response = await self._client.fetch_events(
                cursor=self._cursor,
                include_body=self._include_body,
                limit=EVENT_PAGE_LIMIT,
            )
            if response.get("cursor_expired") is True:
                _LOGGER.warning(
                    "Emailable event history exceeded its %s-day retention window; "
                    "events before the oldest retained cursor may have been missed",
                    response.get("retention_days", 14),
                )

            events = response.get("events")
            if not isinstance(events, list):
                raise EmailableTransientError("Emailable returned an invalid event feed")
            for event in events:
                if not isinstance(event, dict):
                    raise EmailableTransientError("Emailable returned an invalid event")
                self._hass.bus.async_fire(EVENT_EMAIL_READY, self._event_data(event))

            next_cursor = _optional_string(response.get("next_cursor"))
            if next_cursor and next_cursor != self._cursor:
                self._cursor = next_cursor
                await self._async_save_cursor()

            if response.get("has_more") is not True:
                return

        _LOGGER.warning(
            "Emailable event polling reached the per-cycle page limit; remaining events "
            "will be delivered during the next cycle"
        )

    async def _async_save_cursor(self) -> None:
        await self._store.async_save(
            {"initialized": self._initialized, "cursor": self._cursor}
        )

    def _event_data(self, event: dict[str, Any]) -> dict[str, Any]:
        payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
        email = payload.get("email") if isinstance(payload.get("email"), dict) else {}
        classification = payload.get("classification") if isinstance(payload.get("classification"), dict) else {}
        label_values = classification.get("labels") if isinstance(classification.get("labels"), list) else []
        labels = [
            label.get("name")
            for label in label_values
            if isinstance(label, dict) and isinstance(label.get("name"), str)
        ]
        data = {
            "config_entry_id": self._entry.entry_id,
            "event_id": event.get("event_id"),
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
            "attachments": email.get("attachments") if isinstance(email.get("attachments"), list) else [],
        }
        body = email.get("body") if isinstance(email.get("body"), dict) else None
        if self._include_body and body and isinstance(body.get("text"), str):
            data["body"] = body["text"]
        return data

    @property
    def _include_body(self) -> bool:
        return bool(
            self._entry.options.get(
                CONF_INCLUDE_EMAIL_BODY,
                DEFAULT_INCLUDE_EMAIL_BODY,
            )
        )


def _optional_string(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None
