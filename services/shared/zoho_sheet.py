"""Zoho Sheet tabular-data client used by the Mommy Care Kit workflow."""
from __future__ import annotations

from dataclasses import dataclass
import json
import os
from typing import Any, Mapping
from collections.abc import Awaitable, Callable

import httpx

from zoho_oauth import access_token


class ZohoSheetError(RuntimeError):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True, repr=False)
class ZohoSheetConfig:
    client_id: str
    client_secret: str
    refresh_token: str
    resource_id: str
    patient_details_sheet: str = "Patient Details"
    heather_cover_sheet: str = "Heather Cover"
    header_row: int = 4
    region: str = "com"

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "ZohoSheetConfig":
        source = os.environ if env is None else env
        client_id = (
            source.get("ZOHO_SHEET_OAUTH_CLIENT_ID", "").strip()
            or source.get("ZOHO_OAUTH_CLIENT_ID", "").strip()
        )
        client_secret = (
            source.get("ZOHO_SHEET_OAUTH_CLIENT_SECRET", "").strip()
            or source.get("ZOHO_OAUTH_CLIENT_SECRET", "").strip()
        )
        refresh_token = (
            source.get("ZOHO_SHEET_OAUTH_REFRESH_TOKEN", "").strip()
            or source.get("ZOHO_OAUTH_REFRESH_TOKEN", "").strip()
        )
        resource_id = source.get("MCK_ZOHO_SHEET_RESOURCE_ID", "").strip()
        missing = [
            name
            for name, value in (
                ("ZOHO_SHEET_OAUTH_CLIENT_ID/ZOHO_OAUTH_CLIENT_ID", client_id),
                ("ZOHO_SHEET_OAUTH_CLIENT_SECRET/ZOHO_OAUTH_CLIENT_SECRET", client_secret),
                ("ZOHO_SHEET_OAUTH_REFRESH_TOKEN/ZOHO_OAUTH_REFRESH_TOKEN", refresh_token),
                ("MCK_ZOHO_SHEET_RESOURCE_ID", resource_id),
            )
            if not value
        ]
        if missing:
            raise ZohoSheetError("Missing Zoho Sheet configuration: " + ", ".join(missing), 503)
        try:
            header_row = int(source.get("MCK_ZOHO_SHEET_HEADER_ROW", "4"))
        except ValueError as exc:
            raise ZohoSheetError("MCK_ZOHO_SHEET_HEADER_ROW must be an integer.", 503) from exc
        if header_row < 1:
            raise ZohoSheetError("MCK_ZOHO_SHEET_HEADER_ROW must be positive.", 503)
        region = source.get("ZOHO_REGION", "com").strip() or "com"
        if region not in {"com", "eu", "in", "com.au", "jp", "ca", "sa", "com.cn"}:
            raise ZohoSheetError("Unsupported Zoho data center.", 503)
        return cls(
            client_id=client_id,
            client_secret=client_secret,
            refresh_token=refresh_token,
            resource_id=resource_id,
            patient_details_sheet=source.get(
                "MCK_ZOHO_PATIENT_DETAILS_SHEET", "Patient Details"
            ).strip()
            or "Patient Details",
            heather_cover_sheet=source.get(
                "MCK_ZOHO_HEATHER_COVER_SHEET", "Heather Cover"
            ).strip()
            or "Heather Cover",
            header_row=header_row,
            region=region,
        )

    @property
    def accounts_origin(self) -> str:
        if self.region == "ca":
            return "https://accounts.zohocloud.ca"
        return f"https://accounts.zoho.{self.region}"

    @property
    def sheet_origin(self) -> str:
        if self.region == "ca":
            return "https://sheet.zohocloud.ca"
        return f"https://sheet.zoho.{self.region}"


class ZohoSheet:
    def __init__(self, client: httpx.AsyncClient, config: ZohoSheetConfig):
        self.client = client
        self.config = config
        self.headers: dict[str, str] = {}

    async def authenticate(self) -> None:
        try:
            token = await access_token(self.client, self.config)
        except (httpx.HTTPError, ValueError) as exc:
            raise ZohoSheetError("Zoho Sheet authentication could not be confirmed.") from exc
        if not token:
            raise ZohoSheetError("Zoho Sheet authentication failed; reconnect the Sheet scopes.", 503)
        self.headers = {
            "Authorization": f"Zoho-oauthtoken {token}",
            "Accept": "application/json",
        }

    async def _call(self, method: str, **parameters: Any) -> dict[str, Any]:
        if not self.headers:
            await self.authenticate()
        body: dict[str, Any] = {"method": method}
        for key, value in parameters.items():
            if value is None:
                continue
            if isinstance(value, bool):
                body[key] = str(value).lower()
            else:
                body[key] = value
        try:
            response = await self.client.post(
                f"{self.config.sheet_origin}/api/v2/{self.config.resource_id}",
                headers=self.headers,
                data=body,
            )
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise ZohoSheetError("Zoho Sheet request could not be confirmed.") from exc
        if response.is_error or not isinstance(payload, dict):
            raise ZohoSheetError("Zoho Sheet request failed.")
        if payload.get("status") == "failure" or payload.get("error_code"):
            code = payload.get("error_code")
            raise ZohoSheetError(f"Zoho Sheet rejected {method} (error {code}).")
        return payload

    @staticmethod
    def _criteria(column: str, value: str) -> str:
        safe_column = column.replace('"', '\\"')
        safe_value = value.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{safe_column}"="{safe_value}"'

    async def fetch_first(
        self,
        *,
        worksheet_name: str,
        criteria_column: str,
        criteria_value: str,
    ) -> dict[str, Any] | None:
        payload = await self._call(
            "worksheet.records.fetch",
            worksheet_name=worksheet_name,
            header_row=self.config.header_row,
            criteria=self._criteria(criteria_column, criteria_value),
            records_start_index=1,
            count=2,
            render_option="formatted",
        )
        records = payload.get("records")
        if records is None and isinstance(payload.get("data"), list):
            records = payload["data"]
        if not isinstance(records, list):
            raise ZohoSheetError("Zoho Sheet lookup returned an invalid record list.")
        if len(records) > 1:
            raise ZohoSheetError("Duplicate tracker Record ID requires reconciliation.", 409)
        if not records:
            return None
        if not isinstance(records[0], dict):
            raise ZohoSheetError("Zoho Sheet returned an invalid record.")
        return records[0]

    async def upsert_record(
        self,
        *,
        worksheet_name: str,
        record_id: str,
        values: Mapping[str, Any],
        before_write: Callable[[], Awaitable[None]] | None = None,
    ) -> str:
        record = {key: value for key, value in values.items() if value is not None}
        record["Record ID"] = record_id
        existing = await self.fetch_first(
            worksheet_name=worksheet_name,
            criteria_column="Record ID",
            criteria_value=record_id,
        )
        if existing is not None:
            # Preserve staff-maintained workflow and evidence fields on replay.
            protected = {"Intake Date", "Current Stage", "Owner", "Notes",
                         "Doctor Notes Received", "SWO Status (cover)",
                         "Signed SWO Returned", "Heather Follow-up",
                         "Outstanding / Follow-up", "SPEAR Review / Outstanding"}
            record = {key: value for key, value in record.items()
                      if key not in protected and (value != "" or not existing.get(key))}
            if before_write is not None:
                await before_write()
            payload = await self._call(
                "worksheet.records.update",
                worksheet_name=worksheet_name,
                header_row=self.config.header_row,
                criteria=self._criteria("Record ID", record_id),
                first_match_only=True,
                data=json.dumps(record, separators=(",", ":"), default=str),
            )
            affected = payload.get("no_of_affected_rows")
            if affected is not None and int(affected) < 1:
                raise ZohoSheetError("Zoho Sheet update did not affect the expected row.")
            return "updated"

        if before_write is not None:
            await before_write()
        payload = await self._call(
            "worksheet.records.add",
            worksheet_name=worksheet_name,
            header_row=self.config.header_row,
            json_data=json.dumps([record], separators=(",", ":"), default=str),
        )
        if payload.get("status") != "success" or payload.get("start_row") is None:
            raise ZohoSheetError("Zoho Sheet creation did not return a confirmed row identity.")
        return "created"
