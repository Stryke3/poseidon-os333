from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


@dataclass(frozen=True)
class CorpusDocument:
    name: str
    path: str
    relative_path: str
    top_level_folder: str
    parent_folder: str
    file_type: str
    size_bytes: int
    modified_at: str
    document_class: str
    workflow_stage: str
    payer_hint: str | None
    patient_hint: str | None

    def as_dict(self) -> dict:
        return {
            "name": self.name,
            "path": self.path,
            "relative_path": self.relative_path,
            "top_level_folder": self.top_level_folder,
            "parent_folder": self.parent_folder,
            "file_type": self.file_type,
            "size_bytes": self.size_bytes,
            "modified_at": self.modified_at,
            "document_class": self.document_class,
            "workflow_stage": self.workflow_stage,
            "payer_hint": self.payer_hint,
            "patient_hint": self.patient_hint,
        }


class MyBoxCorpusCatalog:
    def __init__(self, root_dir: Path):
        self.root_dir = root_dir

    def summary(self, limit: int = 100) -> dict:
        documents = self._documents()
        by_type = Counter(doc.file_type for doc in documents)
        by_class = Counter(doc.document_class for doc in documents)
        by_stage = Counter(doc.workflow_stage for doc in documents)
        by_top_folder = Counter(doc.top_level_folder for doc in documents)

        return {
            "root_dir": str(self.root_dir),
            "document_count": len(documents),
            "file_type_counts": dict(by_type),
            "document_class_counts": dict(by_class),
            "workflow_stage_counts": dict(by_stage),
            "top_level_folder_counts": dict(by_top_folder),
            "documents": [doc.as_dict() for doc in documents[: max(limit, 0)]],
        }

    def _documents(self) -> list[CorpusDocument]:
        if not self.root_dir.exists():
            return []

        documents: list[CorpusDocument] = []
        for path in sorted(self.root_dir.rglob("*")):
            if not path.is_file():
                continue

            stat = path.stat()
            rel = path.relative_to(self.root_dir)
            parts = rel.parts
            top_level = parts[0] if parts else ""
            parent_folder = parts[-2] if len(parts) >= 2 else top_level
            documents.append(
                CorpusDocument(
                    name=path.name,
                    path=str(path),
                    relative_path=str(rel),
                    top_level_folder=top_level,
                    parent_folder=parent_folder,
                    file_type=path.suffix.lower().lstrip(".") or "unknown",
                    size_bytes=stat.st_size,
                    modified_at=datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    document_class=self._document_class(path.name, parent_folder),
                    workflow_stage=self._workflow_stage(rel.parts),
                    payer_hint=self._payer_hint(parts),
                    patient_hint=self._patient_hint(path.name),
                )
            )
        return documents

    def _document_class(self, file_name: str, parent_folder: str) -> str:
        lower = file_name.lower()
        parent = parent_folder.lower()
        if "eob" in lower:
            return "eob"
        if "appeal" in lower:
            return "appeal"
        if "denial" in lower:
            return "denial"
        if "medical record" in lower:
            return "medical_records"
        if "order" in lower:
            return "order"
        if "auth" in lower or "authorization" in lower or "pre auth" in parent:
            return "authorization"
        if "payment report" in parent:
            return "payment_report"
        if lower.endswith(".csv"):
            return "claims_export"
        if lower.endswith(".png") or lower.endswith(".jpg") or lower.endswith(".jpeg"):
            return "image_capture"
        if lower.endswith(".doc") or lower.endswith(".docx") or ".doc." in lower:
            return "office_document"
        if lower.endswith(".pdf"):
            return "pdf_document"
        return "other"

    def _workflow_stage(self, parts: tuple[str, ...]) -> str:
        joined = " / ".join(part.lower() for part in parts)
        if "completed" in joined:
            return "completed"
        if "new additional documents" in joined:
            return "new_supporting_docs"
        if "appeals to print" in joined:
            return "appeal_preparation"
        if "new asc orders" in joined or "new clinic orders" in joined or "new hpn orders" in joined:
            return "new_orders"
        if "correspondence" in joined:
            return "correspondence"
        if "patient files" in joined:
            return "patient_files"
        return "general"

    def _payer_hint(self, parts: tuple[str, ...]) -> str | None:
        joined = " / ".join(parts).lower()
        for payer in ["cigna", "uhc", "unitedhealthcare", "anthem", "hpn", "ash"]:
            if payer in joined:
                return payer.upper()
        return None

    def _patient_hint(self, file_name: str) -> str | None:
        stem = Path(file_name).stem
        if "_" in stem and "inv" in stem.lower():
            return None
        if " - " in stem:
            candidate = stem.split(" - ", 1)[0].strip()
            if 2 <= len(candidate) <= 40:
                return candidate
        if "," in stem:
            candidate = stem.split(",", 1)[0].strip()
            if 2 <= len(candidate) <= 40:
                return candidate
        return None
