from __future__ import annotations

import aiohttp


class EmailableApiError(Exception):
    """Base error returned by Emailable."""


class EmailableAuthenticationError(EmailableApiError):
    """The configured integration API key was rejected."""


class EmailableRateLimitError(EmailableApiError):
    """The Emailable callback quota or rate limit was reached."""


class EmailableValidationError(EmailableApiError):
    """Emailable rejected the request payload."""


class EmailableTransientError(EmailableApiError):
    """A temporary network or server error occurred."""


class EmailableApiClient:
    def __init__(self, session: aiohttp.ClientSession, base_url: str, api_key: str) -> None:
        self._session = session
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key

    async def get_prompts(self) -> dict:
        return await self._request("GET", "/api/integrations/core-content")

    async def get_email_accounts(self) -> dict:
        return await self._request("GET", "/api/integrations/email-accounts")

    async def create_draft_reply(self, payload: dict) -> dict:
        return await self._request("POST", "/api/integrations/email/drafts/reply", json=payload)

    async def add_labels_on_email(self, payload: dict) -> dict:
        return await self._request("POST", "/api/integrations/email/labels/add", json=payload)

    async def query_email_rules(self, payload: dict) -> dict:
        return await self._request("POST", "/api/integrations/email-rules/query", json=payload)

    async def send_email(self, payload: dict) -> dict:
        return await self._request("POST", "/api/integrations/email/send", json=payload)

    async def fetch_events(
        self,
        *,
        cursor: str | None,
        include_body: bool,
        limit: int = 50,
    ) -> dict:
        params = {
            "event_name": "email.ready_for_processing",
            "limit": str(limit),
            "include_body": "true" if include_body else "false",
        }
        if cursor:
            params["cursor"] = cursor
        return await self._request("GET", "/api/integrations/events", params=params)

    async def report_activity(self, payload: dict) -> dict:
        return await self._request("POST", "/api/integrations/activity-callbacks", json=payload)

    async def _request(self, method: str, path: str, **kwargs) -> dict:
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {self._api_key}"
        headers["Content-Type"] = "application/json"

        timeout = kwargs.pop("timeout", aiohttp.ClientTimeout(total=30, connect=10))
        try:
            async with self._session.request(method, f"{self._base_url}{path}", headers=headers, timeout=timeout, **kwargs) as response:
                try:
                    data = await response.json(content_type=None)
                except (aiohttp.ContentTypeError, ValueError):
                    data = {"error": (await response.text()).strip() or response.reason}
                if response.status >= 400:
                    message = data.get("error") if isinstance(data, dict) else response.reason
                    error_type = _error_type_for_status(response.status)
                    raise error_type(message or "Emailable request failed")
                if not isinstance(data, dict):
                    raise EmailableTransientError("Emailable returned an invalid response")
                return data
        except EmailableApiError:
            raise
        except (aiohttp.ClientError, TimeoutError) as error:
            raise EmailableTransientError(f"Could not reach Emailable: {error}") from error


def _error_type_for_status(status: int) -> type[EmailableApiError]:
    if status in (401, 403):
        return EmailableAuthenticationError
    if status == 429:
        return EmailableRateLimitError
    if 400 <= status < 500:
        return EmailableValidationError
    return EmailableTransientError
