"""Outbound Zoho Mail transport for StrykeFox workflows.

No Google fallback and no automatic send retry. Callers must reconcile an
ambiguous response in Zoho before attempting another send.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable, Iterable
from typing import Any

import httpx

from business_mail import BusinessMailError, ZohoConfig, ZohoMail


class ZohoMailSendUncertain(BusinessMailError):
    """Raised when a send may have reached Zoho but confirmation is unavailable."""


def _message_id(data: Any) -> str | None:
    candidates: list[Any] = [data]
    if isinstance(data, list):
        candidates.extend(data)
    elif isinstance(data, dict):
        candidates.extend(
            data.get(key)
            for key in ("message", "messages", "details", "mail")
            if data.get(key) is not None
        )
    while candidates:
        candidate = candidates.pop(0)
        if isinstance(candidate, list):
            candidates.extend(candidate)
            continue
        if not isinstance(candidate, dict):
            continue
        for key in ("messageId", "message_id", "id"):
            value = candidate.get(key)
            if value is not None and str(value).strip():
                return str(value).strip()
        candidates.extend(value for value in candidate.values() if isinstance(value, (dict, list)))
    return None


class ZohoMailSender(ZohoMail):
    async def send_message(
        self,
        *,
        to_addresses: Iterable[str],
        subject: str,
        content: str,
        cc_addresses: Iterable[str] = (),
        mail_format: str = "plaintext",
        before_send: Callable[[], Awaitable[None]] | None = None,
    ) -> str:
        recipients = [str(address).strip().lower() for address in to_addresses if str(address).strip()]
        cc = [str(address).strip().lower() for address in cc_addresses if str(address).strip()]
        if not recipients:
            raise BusinessMailError("At least one recipient is required.", 400)
        if not subject.strip() or not content.strip():
            raise BusinessMailError("Email subject and content are required.", 400)
        if mail_format not in {"plaintext", "html"}:
            raise BusinessMailError("mail_format must be plaintext or html.", 400)

        await self.authenticate()
        # Authentication failures are definitely pre-send. Persist a dispatch
        # marker only after authentication and immediately before the POST.
        if before_send is not None:
            await before_send()
        try:
            data = await self._request(
                "POST",
                f"/api/accounts/{self.config.account_id}/messages",
                json={
                    "fromAddress": self.config.email,
                    "toAddress": ",".join(recipients),
                    "ccAddress": ",".join(cc),
                    "subject": subject.strip(),
                    "content": content,
                    "mailFormat": mail_format,
                    "encoding": "UTF-8",
                    "askReceipt": "no",
                },
            )
        except BusinessMailError as exc:
            # A timeout/transport error can occur after Zoho accepted the mail.
            # The caller records an uncertain state and never retries automatically.
            raise ZohoMailSendUncertain(str(exc), exc.status_code) from exc

        provider_id = _message_id(data)
        if not provider_id:
            raise ZohoMailSendUncertain(
                "Zoho Mail accepted the request without a confirmable message ID."
            )
        return provider_id


async def build_sender(client: httpx.AsyncClient | None = None) -> tuple[ZohoMailSender, httpx.AsyncClient]:
    owned_client = client or httpx.AsyncClient(timeout=30.0)
    sender = ZohoMailSender(owned_client, ZohoConfig.from_env())
    return sender, owned_client
