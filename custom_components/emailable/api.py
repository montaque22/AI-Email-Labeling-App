from __future__ import annotations

import aiohttp


class EmailableApiClient:
    def __init__(self, session: aiohttp.ClientSession, base_url: str, api_key: str) -> None:
        self._session = session
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key

    async def get_prompts(self) -> dict:
        return await self._request("GET", "/api/integrations/core-content")

    async def create_draft_reply(self, payload: dict) -> dict:
        return await self._request("POST", "/api/integrations/email/drafts/reply", json=payload)

    async def add_labels_on_email(self, payload: dict) -> dict:
        return await self._request("POST", "/api/integrations/email/labels/add", json=payload)

    async def query_email_rules(self, payload: dict) -> dict:
        return await self._request("POST", "/api/integrations/email-rules/query", json=payload)

    async def _request(self, method: str, path: str, **kwargs) -> dict:
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {self._api_key}"
        headers["Content-Type"] = "application/json"

        async with self._session.request(method, f"{self._base_url}{path}", headers=headers, **kwargs) as response:
            data = await response.json(content_type=None)
            if response.status >= 400:
                message = data.get("error") if isinstance(data, dict) else response.reason
                raise RuntimeError(message or "Emailable request failed")
            return data
