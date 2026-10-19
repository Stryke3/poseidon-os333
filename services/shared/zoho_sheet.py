"""Zoho Sheet tabular-data client used by the Mommy Care Kit workflow."""
from __future__ import annotations

from dataclasses import dataclass
import json
import os
from typing import Any, Mapping

import httpx


class ZohoSheetError(RuntimeError):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


class ZohoSheetWriteUncertain(ZohoSheetError):
    """A write may have reached Zoho; reconcile before another append."""


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
        region = source.get("ZOHO_REGION", "com").strip().lower() or "com"
        if region not in {"com", "eu", "in", "com.au", "jp", "ca", "sa", "com.cn"}:
            raise ZohoSheetError("Unsupported Zoho Sheet data center.", 503)
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
            response = await self.client.post(
                f"{self.config.accounts_origin}/oauth/v2/token",
                data={
                    "client_id": self.config.client_id,
                    "client_secret": self.config.client_secret,
                    "refresh_token": self.config.refresh_token,
                    "grant_type": "refresh_token",
                },
            )
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise ZohoSheetError("Zoho Sheet authentication could not be confirmed.") from exc
        token = payload.get("access_token") if isinstance(payload, dict) else None
        if response.is_error or not isinstance(token, str) or not token:
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
        mutating = method in {"worksheet.records.add", "worksheet.records.update"}
        try:
            response = await self.client.post(
                f"{self.config.sheet_origin}/api/v2/{self.config.resource_id}",
                headers=self.headers,
                data=body,
            )
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            error = ZohoSheetWriteUncertain if mutating else ZohoSheetError
            raise error("Zoho Sheet request could not be confirmed.") from exc
        if response.is_error or not isinstance(payload, dict):
            ambiguous = mutating and (
                response.status_code >= 500 or response.status_code == 408
                or not isinstance(payload, dict)
            )
            error = ZohoSheetWriteUncertain if ambiguous else ZohoSheetError
            raise error("Zoho Sheet request failed.")
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
            raise ZohoSheetError("Zoho Sheet returned no verifiable record list.")
        if len(records) > 1:
            raise ZohoSheetError("Duplicate tracker Record ID requires reconciliation.", 409)
        if not records:
            return None
        if not isinstance(records[0], dict) or str(records[0].get(criteria_column, "")) != criteria_value:
            raise ZohoSheetError("Zoho Sheet returned an unexpected record.")
        return records[0]

    async def upsert_record(
        self,
        *,
        worksheet_name: str,
        record_id: str,
        values: Mapping[str, Any],
        allow_create: bool = True,
        initialize_only: tuple[str, ...] = (),
    ) -> str:
        record = {key: value for key, value in values.items() if value is not None}
        record["Record ID"] = record_id
        existing = await self.fetch_first(
            worksheet_name=worksheet_name,
            criteria_column="Record ID",
            criteria_value=record_id,
        )
        if existing is not None:
            # Replays may fill missing intake fields; they must not erase workflow progress.
            record = {
                key: value for key, value in record.items()
                if value != "" and not (
                    key in initialize_only and existing.get(key) not in (None, "")
                )
            }
            if str(existing.get("SPEAR Intake", "")).lower() == "true" and record.get("SPEAR Intake") is False:
                record.pop("SPEAR Intake")
            payload = await self._call(
                "worksheet.records.update",
                worksheet_name=worksheet_name,
                header_row=self.config.header_row,
                criteria=self._criteria("Record ID", record_id),
                first_match_only=True,
                data=json.dumps(record, separators=(",", ":"), default=str),
            )
            affected = payload.get("no_of_affected_rows")
            if affected is None:
                raise ZohoSheetWriteUncertain("Zoho Sheet update returned no row acknowledgment.")
            try:
                count = int(affected)
            except (TypeError, ValueError) as exc:
                raise ZohoSheetWriteUncertain("Zoho Sheet update acknowledgment was invalid.") from exc
            if count != 1:
                raise ZohoSheetWriteUncertain("Zoho Sheet update did not confirm exactly one row.", 409)
            return "updated"

        if not allow_create:
            raise ZohoSheetError(
                "Previously attempted tracker row is not visible; reconcile or retry its lookup.", 409
            )
        payload = await self._call(
            "worksheet.records.add",
            worksheet_name=worksheet_name,
            header_row=self.config.header_row,
            json_data=json.dumps([record], separators=(",", ":"), default=str),
        )
        try:
            start, end = int(payload["start_row"]), int(payload["end_row"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ZohoSheetWriteUncertain("Zoho Sheet append returned no row acknowledgment.") from exc
        if start <= self.config.header_row or end != start:
            raise ZohoSheetWriteUncertain("Zoho Sheet append did not confirm exactly one new row.")
        return "created"
