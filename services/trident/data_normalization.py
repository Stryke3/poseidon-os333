from __future__ import annotations

import math
import re
from datetime import datetime, timedelta
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET


XML_NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


class HistoricalDataNormalizer:
    def __init__(self, base_dir: Path):
        self.base_dir = base_dir

    def preview(self, limit: int = 25) -> dict:
        all_records: list[dict] = []
        by_dataset: dict[str, int] = {}
        files: list[dict[str, object]] = []

        for path in sorted(self.base_dir.iterdir()) if self.base_dir.exists() else []:
            if not path.is_file():
                continue

            normalized = self.normalize_asset(path.name)
            if normalized["record_count"] == 0:
                continue

            dataset_kind = normalized["dataset_kind"]
            by_dataset[dataset_kind] = by_dataset.get(dataset_kind, 0) + normalized["record_count"]
            files.append(
                {
                    "asset_name": path.name,
                    "dataset_kind": dataset_kind,
                    "record_count": normalized["record_count"],
                    "sample_keys": list(normalized["records"][0].keys()) if normalized["records"] else [],
                }
            )
            all_records.extend(normalized["records"])

        return {
            "base_dir": str(self.base_dir),
            "record_count": len(all_records),
            "dataset_record_counts": by_dataset,
            "files": files,
            "records": all_records[: max(limit, 0)],
        }

    def normalize_asset(self, asset_name: str, limit: int | None = None) -> dict:
        path = self.base_dir / asset_name
        if not path.exists() or not path.is_file():
            return {"asset_name": asset_name, "dataset_kind": "missing", "record_count": 0, "records": []}

        dataset_kind = self._dataset_kind(path.name)
        if dataset_kind == "ar_aging_report" and path.suffix.lower() == ".xlsx":
            records = self._normalize_ar_report(path)
        elif dataset_kind == "charge_detail_report" and path.suffix.lower() == ".xlsx":
            records = self._normalize_charge_detail(path)
        else:
            records = []

        if limit is not None:
            records = records[: max(limit, 0)]

        return {
            "asset_name": asset_name,
            "dataset_kind": dataset_kind,
            "record_count": len(records),
            "records": records,
        }

    def _normalize_ar_report(self, path: Path) -> list[dict]:
        rows = self._workbook_rows(path)
        records: list[dict] = []
        current_branch: str | None = None
        current_payer: str | None = None
        snapshot_date = self._extract_snapshot_date(path.name)
        header_map: dict[str, str] | None = None

        for row in rows:
            values = {key: self._strip(value) for key, value in row.items()}
            text_values = [value for value in values.values() if value]

            branch_marker = next((value for value in text_values if value.startswith("Branch :")), None)
            insurance_marker = next((value for value in text_values if value.startswith("Insurance :")), None)
            if branch_marker:
                current_branch = self._clean_group_name(self._after_colon(branch_marker))
                continue
            if insurance_marker:
                current_payer = self._clean_group_name(self._after_colon(insurance_marker))
                continue

            maybe_header = self._extract_ar_header(values)
            if maybe_header:
                header_map = maybe_header
                continue
            if not header_map:
                continue

            patient = values.get(header_map["patient"], "")
            if patient in {"", "Patient", "Totals"}:
                continue

            amount_fields = [
                values.get(header_map.get("aging_0_30", ""), ""),
                values.get(header_map.get("aging_31_60", ""), ""),
                values.get(header_map.get("aging_61_90", ""), ""),
                values.get(header_map.get("aging_91_120", ""), ""),
                values.get(header_map.get("aging_120_plus", ""), ""),
                values.get(header_map.get("total_balance", ""), ""),
            ]
            if not any(amount_fields):
                continue

            records.append(
                {
                    "source_file": path.name,
                    "source_kind": "ar_aging_report",
                    "snapshot_date": snapshot_date,
                    "branch": current_branch,
                    "payer_name": current_payer,
                    "patient_name": patient,
                    "date_of_service": self._excel_date_to_iso(values.get(header_map["dos"])),
                    "aging_0_30": self._to_float(values.get(header_map.get("aging_0_30", ""))),
                    "aging_31_60": self._to_float(values.get(header_map.get("aging_31_60", ""))),
                    "aging_61_90": self._to_float(values.get(header_map.get("aging_61_90", ""))),
                    "aging_91_120": self._to_float(values.get(header_map.get("aging_91_120", ""))),
                    "aging_120_plus": self._to_float(values.get(header_map.get("aging_120_plus", ""))),
                    "total_balance": self._to_float(values.get(header_map.get("total_balance", ""))),
                }
            )

        return records

    def _normalize_charge_detail(self, path: Path) -> list[dict]:
        rows = self._workbook_rows(path)
        if not rows:
            return []

        header = rows[0]
        header_map = {column: self._slugify(value) for column, value in header.items() if value}
        records: list[dict] = []

        for row in rows[1:]:
            values = {header_map[column]: self._strip(value) for column, value in row.items() if column in header_map}
            if not values.get("code"):
                continue

            records.append(
                {
                    "source_file": path.name,
                    "source_kind": "charge_detail_report",
                    "hcpcs_code": values.get("code"),
                    "quantity": self._to_float(values.get("quantity")),
                    "billed_amount": self._to_float(values.get("billed_amount")),
                    "allowable_amount": self._to_float(values.get("allowable")),
                    "claim_submission_allowable": self._to_float(values.get("allowable_claim_submission")),
                    "paid_amount": self._to_float(values.get("total_payments")),
                    "adjustment_amount": self._to_float(values.get("total_adjustments")),
                    "balance_amount": self._to_float(values.get("balance")),
                    "branch": values.get("branch"),
                    "device_type": values.get("device_type"),
                    "treating_practitioner": values.get("treating_practitioner"),
                    "payer_name": values.get("primary_insurance"),
                    "referring_physician": values.get("referring_physician"),
                    "date_of_service": self._excel_date_to_iso(values.get("dos")),
                    "date_billed": self._excel_date_to_iso(values.get("date_billed")),
                    "claim_number": self._normalize_id(values.get("claim_number")),
                    "patient_name": values.get("patient_name"),
                    "claim_status": values.get("status"),
                }
            )

        return records

    def _workbook_rows(self, path: Path) -> list[dict[str, str]]:
        with ZipFile(path) as workbook:
            shared_strings = self._shared_strings(workbook)
            sheet_xml_path = self._first_sheet_xml_path(workbook)
            if not sheet_xml_path:
                return []

            worksheet = ET.fromstring(workbook.read(sheet_xml_path))
            sheet_data = worksheet.find("a:sheetData", XML_NS)
            if sheet_data is None:
                return []

            rows: list[dict[str, str]] = []
            for row in sheet_data.findall("a:row", XML_NS):
                row_data: dict[str, str] = {}
                for cell in row.findall("a:c", XML_NS):
                    ref = cell.attrib.get("r", "")
                    column = "".join(ch for ch in ref if ch.isalpha())
                    row_data[column] = self._cell_value(cell, shared_strings)
                rows.append(row_data)
            return rows

    def _shared_strings(self, workbook: ZipFile) -> list[str]:
        try:
            root = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
        except KeyError:
            return []
        return ["".join(node.text or "" for node in item.iterfind(".//a:t", XML_NS)) for item in root.findall("a:si", XML_NS)]

    def _first_sheet_xml_path(self, workbook: ZipFile) -> str | None:
        workbook_xml = ET.fromstring(workbook.read("xl/workbook.xml"))
        rels_xml = ET.fromstring(workbook.read("xl/_rels/workbook.xml.rels"))
        rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels_xml}
        sheets = workbook_xml.find("a:sheets", XML_NS)
        if sheets is None or not list(sheets):
            return None

        first_sheet = list(sheets)[0]
        rel_id = first_sheet.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        target = rel_map.get(rel_id or "")
        return f"xl/{target}" if target else None

    def _cell_value(self, cell: ET.Element, shared_strings: list[str]) -> str:
        cell_type = cell.attrib.get("t")
        value = cell.find("a:v", XML_NS)
        inline = cell.find("a:is", XML_NS)
        if inline is not None:
            return "".join(node.text or "" for node in inline.iterfind(".//a:t", XML_NS))
        if value is None:
            return ""
        raw = value.text or ""
        if cell_type == "s":
            try:
                return shared_strings[int(raw)]
            except Exception:
                return raw
        return raw

    def _dataset_kind(self, file_name: str) -> str:
        lower = file_name.lower()
        if "ar_report" in lower:
            return "ar_aging_report"
        if "charges billed" in lower:
            return "charge_detail_report"
        return "unsupported"

    def _extract_snapshot_date(self, file_name: str) -> str | None:
        match = re.search(r"(20\d{2}-\d{2}-\d{2})", file_name)
        if not match:
            return None
        return match.group(1)

    def _extract_ar_header(self, row: dict[str, str]) -> dict[str, str] | None:
        normalized = {column: self._strip(value).lower() for column, value in row.items() if self._strip(value)}
        patient_col = next((column for column, value in normalized.items() if value == "patient"), None)
        dos_col = next((column for column, value in normalized.items() if value == "dos"), None)
        total_col = next((column for column, value in normalized.items() if value == "total"), None)
        if not patient_col or not dos_col or not total_col:
            return None

        header_map = {
            "patient": patient_col,
            "dos": dos_col,
            "total_balance": total_col,
        }
        age_map = {
            "0-30": "aging_0_30",
            "0-30 days": "aging_0_30",
            "31-60": "aging_31_60",
            "30-60 days": "aging_31_60",
            "61-90": "aging_61_90",
            "60 - 90 days": "aging_61_90",
            "91-120": "aging_91_120",
            "90 - 120 days": "aging_91_120",
            "120+": "aging_120_plus",
            "120+": "aging_120_plus",
        }
        for column, value in normalized.items():
            mapped = age_map.get(value)
            if mapped:
                header_map[mapped] = column

        return header_map

    def _excel_date_to_iso(self, value: str | None) -> str | None:
        if not value:
            return None
        stripped = self._strip(value)
        if not stripped:
            return None
        if re.match(r"^\d{4}-\d{2}-\d{2}$", stripped):
            return stripped
        try:
            numeric = float(stripped)
        except ValueError:
            return stripped

        if math.isnan(numeric):
            return None

        if numeric < 1000:
            return stripped

        base = datetime(1899, 12, 30)
        converted = base + timedelta(days=numeric)
        return converted.date().isoformat()

    def _to_float(self, value: str | None) -> float | None:
        if value is None:
            return None
        stripped = self._strip(value).replace(",", "")
        if stripped == "":
            return None
        try:
            return round(float(stripped), 2)
        except ValueError:
            return None

    def _normalize_id(self, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = self._strip(value)
        if stripped.endswith(".0"):
            stripped = stripped[:-2]
        return stripped or None

    def _strip(self, value: str | None) -> str:
        return (value or "").strip()

    def _after_colon(self, value: str) -> str:
        return value.split(":", 1)[1].strip() if ":" in value else value.strip()

    def _slugify(self, value: str) -> str:
        slug = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
        return slug

    def _clean_group_name(self, value: str) -> str | None:
        cleaned = re.sub(r"\s*\(\d+\s+items?\)\s*$", "", value).strip()
        return cleaned or None
