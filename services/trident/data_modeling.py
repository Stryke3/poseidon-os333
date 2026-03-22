from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET


XML_NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


@dataclass(frozen=True)
class DataAssetProfile:
    name: str
    path: str
    file_type: str
    dataset_kind: str
    size_bytes: int
    modified_at: str
    training_role: str
    business_domain: str
    status: str
    sheets: list[str]
    column_headers: list[str]
    preview_rows: list[dict[str, str]]
    source_reference: dict[str, str]
    inferred_fields: list[str]
    notes: list[str]

    def as_dict(self) -> dict:
        return {
            "name": self.name,
            "path": self.path,
            "file_type": self.file_type,
            "dataset_kind": self.dataset_kind,
            "size_bytes": self.size_bytes,
            "modified_at": self.modified_at,
            "training_role": self.training_role,
            "business_domain": self.business_domain,
            "status": self.status,
            "sheets": self.sheets,
            "column_headers": self.column_headers,
            "preview_rows": self.preview_rows,
            "source_reference": self.source_reference,
            "inferred_fields": self.inferred_fields,
            "notes": self.notes,
        }


class HistoricalDataCatalog:
    def __init__(self, base_dir: Path):
        self.base_dir = base_dir

    def summary(self) -> dict:
        assets = [profile.as_dict() for profile in self._profiles()]
        dataset_counts: dict[str, int] = {}
        status_counts: dict[str, int] = {}

        for asset in assets:
            dataset_counts[asset["dataset_kind"]] = dataset_counts.get(asset["dataset_kind"], 0) + 1
            status_counts[asset["status"]] = status_counts.get(asset["status"], 0) + 1

        return {
            "base_dir": str(self.base_dir),
            "asset_count": len(assets),
            "dataset_counts": dataset_counts,
            "status_counts": status_counts,
            "model_targets": self.model_targets(),
            "assets": assets,
        }

    def asset(self, name: str) -> dict | None:
        for profile in self._profiles():
            if profile.name == name:
                return profile.as_dict()
        return None

    def model_targets(self) -> list[dict[str, object]]:
        return [
            {
                "entity": "claims_ar_snapshot",
                "description": "AR aging snapshots by branch and aging bucket for denial backlog and collections risk modeling.",
                "source_kinds": ["ar_aging_report"],
                "candidate_keys": ["branch", "claim_number", "patient_name", "aging_bucket"],
            },
            {
                "entity": "charge_line_history",
                "description": "Line-level billed and paid charge history for reimbursement, denial, and underpayment modeling.",
                "source_kinds": ["charge_detail_report"],
                "candidate_keys": ["claim_number", "hcpcs_code", "dos", "patient_name", "primary_insurance"],
            },
            {
                "entity": "payer_tracking_sheet",
                "description": "Operational Google Sheets referenced locally and expected to contain manual tracking and provider roster data.",
                "source_kinds": ["tracking_sheet_pointer", "provider_roster_pointer", "payer_matrix_pointer"],
                "candidate_keys": ["doc_id", "sheet_name", "payer", "provider", "status"],
            },
        ]

    def _profiles(self) -> list[DataAssetProfile]:
        if not self.base_dir.exists():
            return []
        return [self._build_profile(path) for path in sorted(self.base_dir.iterdir()) if path.is_file()]

    def _build_profile(self, path: Path) -> DataAssetProfile:
        stat = path.stat()
        file_type = path.suffix.lower().lstrip(".") or "unknown"
        dataset_kind = self._dataset_kind(path.name)
        training_role = self._training_role(dataset_kind)
        business_domain = self._business_domain(dataset_kind)
        status = self._status(path)
        sheets: list[str] = []
        column_headers: list[str] = []
        preview_rows: list[dict[str, str]] = []
        source_reference: dict[str, str] = {}
        notes: list[str] = []

        if path.suffix.lower() == ".gsheet":
            source_reference = self._parse_gsheet_pointer(path)
            notes.append("Google Sheets pointer only; sheet contents are not present in the repository.")
        elif path.suffix.lower() == ".xlsx":
            workbook_info = self._parse_xlsx(path)
            sheets = workbook_info["sheets"]
            column_headers = workbook_info["column_headers"]
            preview_rows = workbook_info["preview_rows"]
            notes.extend(workbook_info["notes"])
        elif path.suffix.lower() == ".crdownload":
            notes.append("Incomplete download; exclude from training until replaced with a finished source file.")

        inferred_fields = self._infer_fields(dataset_kind, column_headers)
        date_note = self._extract_date_note(path.name)
        if date_note:
            notes.append(date_note)

        return DataAssetProfile(
            name=path.name,
            path=str(path),
            file_type=file_type,
            dataset_kind=dataset_kind,
            size_bytes=stat.st_size,
            modified_at=datetime.fromtimestamp(stat.st_mtime).isoformat(),
            training_role=training_role,
            business_domain=business_domain,
            status=status,
            sheets=sheets,
            column_headers=column_headers,
            preview_rows=preview_rows,
            source_reference=source_reference,
            inferred_fields=inferred_fields,
            notes=notes,
        )

    def _dataset_kind(self, file_name: str) -> str:
        lower = file_name.lower()
        if "ar_report" in lower:
            return "ar_aging_report"
        if "charges billed" in lower:
            return "charge_detail_report"
        if "tracking" in lower:
            return "tracking_sheet_pointer"
        if "providers" in lower:
            return "provider_roster_pointer"
        if "pmp" in lower:
            return "payer_matrix_pointer"
        if lower.endswith(".gsheet"):
            return "google_sheet_pointer"
        if lower.endswith(".crdownload"):
            return "partial_download"
        return "unclassified"

    def _training_role(self, dataset_kind: str) -> str:
        return {
            "ar_aging_report": "supervised_feature_source",
            "charge_detail_report": "supervised_label_and_feature_source",
            "tracking_sheet_pointer": "operational_enrichment_source",
            "provider_roster_pointer": "provider_enrichment_source",
            "payer_matrix_pointer": "payer_rule_enrichment_source",
            "google_sheet_pointer": "external_reference_source",
            "partial_download": "exclude",
            "unclassified": "review",
        }[dataset_kind]

    def _business_domain(self, dataset_kind: str) -> str:
        return {
            "ar_aging_report": "accounts_receivable",
            "charge_detail_report": "billing",
            "tracking_sheet_pointer": "operations",
            "provider_roster_pointer": "providers",
            "payer_matrix_pointer": "payer_rules",
            "google_sheet_pointer": "operations",
            "partial_download": "ingestion",
            "unclassified": "unknown",
        }[dataset_kind]

    def _status(self, path: Path) -> str:
        suffix = path.suffix.lower()
        if suffix == ".crdownload":
            return "incomplete"
        if suffix in {".xlsx", ".gsheet"}:
            return "ready_for_mapping"
        return "unknown"

    def _parse_gsheet_pointer(self, path: Path) -> dict[str, str]:
        try:
            payload = json.loads(path.read_text())
        except Exception:
            return {}

        result = {}
        for key in ["doc_id", "resource_key", "email"]:
            value = payload.get(key)
            if value:
                result[key] = value
        return result

    def _parse_xlsx(self, path: Path) -> dict[str, object]:
        sheets: list[str] = []
        column_headers: list[str] = []
        preview_rows: list[dict[str, str]] = []
        notes: list[str] = []

        try:
            with ZipFile(path) as workbook:
                sheets = self._sheet_names(workbook)
                shared_strings = self._shared_strings(workbook)
                first_sheet_xml = self._first_sheet_xml_path(workbook)
                if not first_sheet_xml:
                    notes.append("Workbook metadata loaded, but no worksheet XML target was resolved.")
                    return {
                        "sheets": sheets,
                        "column_headers": column_headers,
                        "preview_rows": preview_rows,
                        "notes": notes,
                    }

                worksheet = ET.fromstring(workbook.read(first_sheet_xml))
                rows = self._sheet_rows(worksheet, shared_strings)
                header_row = self._best_header_row(rows)
                if header_row:
                    column_headers = [value for value in header_row.values() if value]
                preview_rows = rows[:5]
        except Exception as exc:
            notes.append(f"Workbook parsing failed: {exc}")

        return {
            "sheets": sheets,
            "column_headers": column_headers,
            "preview_rows": preview_rows,
            "notes": notes,
        }

    def _sheet_names(self, workbook: ZipFile) -> list[str]:
        root = ET.fromstring(workbook.read("xl/workbook.xml"))
        sheets = root.find("a:sheets", XML_NS)
        if sheets is None:
            return []
        return [sheet.attrib.get("name", "") for sheet in sheets]

    def _shared_strings(self, workbook: ZipFile) -> list[str]:
        try:
            root = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
        except KeyError:
            return []

        values: list[str] = []
        for item in root.findall("a:si", XML_NS):
            values.append("".join(node.text or "" for node in item.iterfind(".//a:t", XML_NS)))
        return values

    def _first_sheet_xml_path(self, workbook: ZipFile) -> str | None:
        workbook_xml = ET.fromstring(workbook.read("xl/workbook.xml"))
        rels_xml = ET.fromstring(workbook.read("xl/_rels/workbook.xml.rels"))
        rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels_xml}
        sheets = workbook_xml.find("a:sheets", XML_NS)
        if sheets is None or not list(sheets):
            return None

        first_sheet = list(sheets)[0]
        rel_id = first_sheet.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        if not rel_id:
            return None

        target = rel_map.get(rel_id)
        return f"xl/{target}" if target else None

    def _sheet_rows(self, worksheet: ET.Element, shared_strings: list[str]) -> list[dict[str, str]]:
        rows: list[dict[str, str]] = []
        sheet_data = worksheet.find("a:sheetData", XML_NS)
        if sheet_data is None:
            return rows

        for row in list(sheet_data)[:8]:
            row_dict: dict[str, str] = {}
            for cell in row.findall("a:c", XML_NS):
                ref = cell.attrib.get("r", "")
                column = "".join(ch for ch in ref if ch.isalpha())
                row_dict[column] = self._cell_value(cell, shared_strings)
            rows.append(row_dict)
        return rows

    def _cell_value(self, cell: ET.Element, shared_strings: list[str]) -> str:
        value = cell.find("a:v", XML_NS)
        inline = cell.find("a:is", XML_NS)
        cell_type = cell.attrib.get("t")

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

    def _best_header_row(self, rows: list[dict[str, str]]) -> dict[str, str]:
        best: dict[str, str] = {}
        best_score = 0
        for row in rows:
            values = [value.strip() for value in row.values() if value.strip()]
            score = len(values)
            if score > best_score and any(" " in value or value.isalpha() for value in values):
                best = row
                best_score = score
        return best

    def _infer_fields(self, dataset_kind: str, column_headers: list[str]) -> list[str]:
        inferred: list[str] = []
        lower_headers = {header.lower(): header for header in column_headers}

        if dataset_kind == "charge_detail_report":
            mapping = {
                "Code": "hcpcs_code",
                "Quantity": "quantity",
                "Billed Amount": "billed_amount",
                "Allowable": "allowable_amount",
                "Total Payments": "paid_amount",
                "Total Adjustments": "adjustment_amount",
                "Balance": "balance_amount",
                "Primary Insurance": "payer_name",
                "DOS": "date_of_service",
                "Date Billed": "date_billed",
                "Claim Number": "claim_number",
                "Patient Name": "patient_name",
                "Status": "claim_status",
            }
            inferred.extend(value for key, value in mapping.items() if key.lower() in lower_headers)
        elif dataset_kind == "ar_aging_report":
            inferred.extend(["report_name", "branch", "aging_bucket_0_30", "aging_bucket_30_60", "aging_bucket_60_90", "aging_bucket_90_120", "aging_bucket_120_plus", "total_balance"])
        elif dataset_kind.endswith("_pointer") or dataset_kind == "google_sheet_pointer":
            inferred.extend(["doc_id", "resource_key", "owner_email"])

        return inferred

    def _extract_date_note(self, file_name: str) -> str | None:
        iso_match = re.findall(r"(20\d{2}-\d{2}-\d{2})", file_name)
        dotted_match = re.findall(r"(20\d{2}\.\d{2}\.\d{2})", file_name)
        parts = []
        if iso_match:
            parts.append(f"File name suggests snapshot dates: {', '.join(iso_match)}.")
        if dotted_match:
            parts.append(f"File name suggests period markers: {', '.join(dotted_match)}.")
        return " ".join(parts) if parts else None
