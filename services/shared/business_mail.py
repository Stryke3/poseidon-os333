"""Zoho-only mail transport for StrykeFox intake. No Google fallback.

Credentials stay in the deployment secret manager. API errors deliberately omit
upstream bodies, which can contain mailbox content or credentials.
"""
from __future__ import annotations

from dataclasses import dataclass
import os
import re
from typing import Mapping

import httpx


class BusinessMailError(RuntimeError):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True, repr=False)
class ZohoConfig:
    client_id: str
    client_secret: str
    refresh_token: str
    account_id: str
    email: str
    folder_id: str
    mailbox: str = "INBOX"
    region: str = "com"

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "ZohoConfig":
        env = os.environ if env is None else env
        if env.get("EMAIL_PROVIDER", "zoho").strip().lower() != "zoho":
            raise BusinessMailError("EMAIL_PROVIDER must be zoho for StrykeFox intake.", 503)
        keys = ("ZOHO_OAUTH_CLIENT_ID", "ZOHO_OAUTH_CLIENT_SECRET", "ZOHO_OAUTH_REFRESH_TOKEN",
                "ZOHO_MAIL_ACCOUNT_ID", "EMAIL_INTAKE_USERNAME", "ZOHO_MAIL_FOLDER_ID")
        missing = [key for key in keys if not env.get(key, "").strip()]
        if missing:
            raise BusinessMailError("Missing Zoho intake configuration: " + ", ".join(missing), 503)
        region = env.get("ZOHO_REGION", "com").strip()
        if region not in {"com", "eu", "in", "com.au", "jp", "ca", "sa", "com.cn"}:
            raise BusinessMailError("ZOHO_REGION is not a supported Zoho data center.", 503)
        account_id, folder_id = env["ZOHO_MAIL_ACCOUNT_ID"].strip(), env["ZOHO_MAIL_FOLDER_ID"].strip()
        if not account_id.isdecimal() or not folder_id.isdecimal():
            raise BusinessMailError("Zoho account and folder IDs must be verified numeric IDs.", 503)
        email = env["EMAIL_INTAKE_USERNAME"].strip().lower()
        if not re.fullmatch(r"[^\s@]+@strykefox\.com", email):
            raise BusinessMailError("EMAIL_INTAKE_USERNAME must identify a StrykeFox mailbox.", 503)
        return cls(*(env[key].strip() for key in keys[:3]), account_id, email, folder_id,
                   env.get("EMAIL_INTAKE_MAILBOX", "INBOX").strip(), region)

    @property
    def mail_origin(self) -> str:
        return f"https://mail.zoho.{self.region}"


class ZohoMail:
    def __init__(self, client: httpx.AsyncClient, config: ZohoConfig):
        self.client, self.config = client, config
        self.headers: dict[str, str] = {}

    async def _request(self, method: str, path: str, *, allow_empty: bool = False, **kwargs):
        try:
            response = await self.client.request(method, self.config.mail_origin + path,
                                                 headers=self.headers, **kwargs)
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise BusinessMailError("Zoho Mail request could not be confirmed.") from exc
        code = (payload.get("status") or {}).get("code") if isinstance(payload, dict) else None
        if response.is_error or not isinstance(code, int) or not 200 <= code < 300:
            raise BusinessMailError("Zoho Mail request failed; check the connection and granted scopes.")
        if "data" not in payload and not allow_empty:
            raise BusinessMailError("Zoho Mail returned an incomplete response.")
        return payload.get("data")

    async def authenticate(self):
        try:
            response = await self.client.post(f"https://accounts.zoho.{self.config.region}/oauth/v2/token",
                data={"client_id": self.config.client_id, "client_secret": self.config.client_secret,
                      "refresh_token": self.config.refresh_token, "grant_type": "refresh_token"})
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise BusinessMailError("Zoho Mail authentication could not be confirmed.") from exc
        token = payload.get("access_token") if isinstance(payload, dict) else None
        if response.is_error or not isinstance(token, str) or not token:
            raise BusinessMailError("Zoho Mail authentication failed; reconnect the configured account.")
        self.headers = {"Authorization": f"Zoho-oauthtoken {token}", "Accept": "application/json"}
        accounts = await self._request("GET", "/api/accounts")
        if not isinstance(accounts, list):
            raise BusinessMailError("Zoho Mail account identity could not be verified.")
        account = next((a for a in accounts if str(a.get("accountId")) == self.config.account_id), None)
        if not account:
            raise BusinessMailError("Configured Zoho account is not accessible.", 503)
        addresses = {str(account.get(key, "")).lower() for key in
                     ("primaryEmailAddress", "mailboxAddress", "incomingUserName")}
        addresses.update(str(a.get("mailId", "")).lower() for a in account.get("emailAddress", [])
                         if a.get("isConfirmed") is True)
        if self.config.email not in addresses:
            raise BusinessMailError("Authenticated Zoho mailbox does not match EMAIL_INTAKE_USERNAME.", 503)

    def _mailbox(self, mailbox: str):
        if mailbox.strip().lower() not in {self.config.mailbox.lower(), self.config.folder_id}:
            raise BusinessMailError("Mailbox has no verified Zoho folder mapping.", 400)

    async def fetch_messages(self, mailbox: str, search: str, max_messages: int) -> list[dict]:
        self._mailbox(mailbox)
        if not 1 <= max_messages <= 200:
            raise BusinessMailError("max_messages must be between 1 and 200.", 400)
        normalized = search.strip().upper() or "UNSEEN"
        if normalized not in {"UNSEEN", "ALL"}:
            raise BusinessMailError("Use UNSEEN or ALL for Zoho intake; legacy Gmail queries require explicit migration.", 400)
        await self.authenticate()
        base = f"/api/accounts/{self.config.account_id}"
        refs = await self._request("GET", base + "/messages/view", params={
            "folderId": self.config.folder_id, "start": 1, "limit": max_messages,
            "status": "unread" if normalized == "UNSEEN" else "all", "includeto": "true"})
        if not isinstance(refs, list) or len(refs) > max_messages:
            raise BusinessMailError("Zoho Mail returned an invalid message list.")
        messages = []
        for ref in refs:
            message_id = str(ref.get("messageId", ""))
            if not message_id.isdecimal() or str(ref.get("folderId", "")) != self.config.folder_id:
                raise BusinessMailError("Zoho Mail returned a message outside the verified folder.")
            data = await self._request("GET", base + f"/messages/{message_id}/originalmessage")
            if not isinstance(data, dict) or not isinstance(data.get("content"), str) or not data["content"]:
                raise BusinessMailError("Zoho Mail original message is missing; intake was not advanced.")
            messages.append({"provider_id": message_id, "account_id": self.config.account_id,
                             "folder_id": self.config.folder_id, "raw": data["content"].encode("utf-8")})
        return messages

    async def mark_seen(self, mailbox: str, message_ids: list[str]):
        self._mailbox(mailbox)
        if not message_ids:
            return
        if any(not str(mid).isdecimal() for mid in message_ids):
            raise BusinessMailError("Only verified Zoho message IDs may be updated.", 400)
        await self.authenticate()
        for start in range(0, len(message_ids), 200):
            await self._request("PUT", f"/api/accounts/{self.config.account_id}/updatemessage",
                allow_empty=True, json={"mode": "markAsRead", "messageId": [int(mid) for mid in message_ids[start:start+200]]})
