from __future__ import annotations

import argparse
import json
import re
import signal
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import pdfplumber


DENIAL_PATTERNS = {
    "medical_necessity": r"medical necessity|not medically necessary",
    "authorization": r"prior authori[sz]ation|pre[- ]?auth|authorization",
    "timely_filing": r"timely filing|filing limit|filing deadline",
    "coverage": r"not covered|coverage criteria|benefit exclusion|excluded benefit",
    "out_of_network": r"out[- ]of[- ]network|non[- ]participating|nonparticipating provider",
    "records_requested": r"medical records request|additional documentation|records were requested",
    "duplicate_claim": r"duplicate claim|previously processed",
    "coding": r"incorrect coding|invalid code|modifier|hcpcs|cpt",
}

PROCESS_PATTERNS = {
    "appeal_submission": r"appeal|reconsideration|provider dispute|dispute resolution|grievance",
    "documentation_needed": r"attach|enclosed|supporting documentation|medical records|operative report",
    "deadline": r"within \d+ days|calendar days|business days|deadline|timely",
    "review_path": r"peer review|independent review|first[- ]level|second[- ]level|external review",
    "contact_channel": r"fax|mail|portal|availity|provider portal|submit to",
}

LETTER_PATTERNS = {
    "respectful_request": r"please accept this letter as|we respectfully request|we are requesting",
    "overturn_request": r"overturn|reverse the denial|reprocess the claim",
    "medical_rationale": r"medically necessary|clinical documentation|based on the medical records",
    "enclosures": r"enclosed please find|attached please find|supporting documentation",
    "follow_up": r"please contact|if you have any questions|thank you for your review",
}


@dataclass
class PDFExtractionResult:
    file_path: str
    relative_path: str
    page_count: int
    pages_scanned: int
    chars_extracted: int
    doc_class: str
    snippets: dict[str, list[str]]


class PDFCorpusLearner:
    def __init__(self, corpus_dir: Path, output_path: Path, max_pages_general: int = 1, max_pages_priority: int = 3, per_pdf_timeout_seconds: int = 10):
        self.corpus_dir = corpus_dir
        self.output_path = output_path
        self.max_pages_general = max_pages_general
        self.max_pages_priority = max_pages_priority
        self.per_pdf_timeout_seconds = per_pdf_timeout_seconds
        self.text_target_classes = {"appeal", "denial", "eob", "medical_records", "authorization", "order"}

    def run(self) -> dict:
        pdfs = sorted(self.corpus_dir.rglob("*.pdf"))
        file_type_counts = Counter()
        class_counts = Counter()
        denial_counts = Counter()
        process_counts = Counter()
        letter_counts = Counter()
        snippet_bank: dict[str, list[dict[str, str]]] = defaultdict(list)
        parsed = 0
        errors = 0
        total_pages_scanned = 0
        targeted_pdf_count = 0

        for path in pdfs:
            file_type_counts[path.suffix.lower().lstrip(".")] += 1
            doc_class = self._document_class(path)
            class_counts[doc_class] += 1
            if doc_class not in self.text_target_classes:
                continue
            targeted_pdf_count += 1

            try:
                result = self._extract_with_timeout(path, doc_class)
                parsed += 1
                total_pages_scanned += result.pages_scanned
                self._merge_snippets(snippet_bank, result)
                text = "\n".join(line for lines in result.snippets.values() for line in lines)
                lower = text.lower()

                for key, pattern in DENIAL_PATTERNS.items():
                    if re.search(pattern, lower, re.I):
                        denial_counts[key] += 1
                for key, pattern in PROCESS_PATTERNS.items():
                    if re.search(pattern, lower, re.I):
                        process_counts[key] += 1
                for key, pattern in LETTER_PATTERNS.items():
                    if re.search(pattern, lower, re.I):
                        letter_counts[key] += 1
            except Exception:
                errors += 1

        summary = {
            "corpus_dir": str(self.corpus_dir),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "pdf_count": len(pdfs),
            "text_target_pdf_count": targeted_pdf_count,
            "parsed_pdf_count": parsed,
            "parse_error_count": errors,
            "page_scan_policy": {
                "general_documents": self.max_pages_general,
                "priority_documents": self.max_pages_priority,
                "per_pdf_timeout_seconds": self.per_pdf_timeout_seconds,
                "priority_classes": ["appeal", "denial", "eob", "medical_records", "authorization"],
                "text_target_classes": sorted(self.text_target_classes),
            },
            "total_pages_scanned": total_pages_scanned,
            "document_class_counts": dict(class_counts),
            "denial_phrase_counts": dict(denial_counts),
            "appeal_process_counts": dict(process_counts),
            "letter_writing_counts": dict(letter_counts),
            "examples": {key: value[:5] for key, value in snippet_bank.items()},
        }
        self.output_path.parent.mkdir(parents=True, exist_ok=True)
        self.output_path.write_text(json.dumps(summary, indent=2))
        return summary

    def _extract_with_timeout(self, path: Path, doc_class: str) -> PDFExtractionResult:
        previous = signal.getsignal(signal.SIGALRM)

        def _timeout_handler(signum, frame):
            raise TimeoutError(f"Timed out while parsing {path.name}")

        signal.signal(signal.SIGALRM, _timeout_handler)
        signal.alarm(self.per_pdf_timeout_seconds)
        try:
            return self._extract(path, doc_class)
        finally:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, previous)

    def _extract(self, path: Path, doc_class: str) -> PDFExtractionResult:
        priority = doc_class in {"appeal", "denial", "eob", "medical_records", "authorization"}
        max_pages = self.max_pages_priority if priority else self.max_pages_general
        snippets: dict[str, list[str]] = {"appeal_phrases": [], "denial_phrases": [], "letter_phrases": []}
        chars_extracted = 0
        page_count = 0
        pages_scanned = 0

        with pdfplumber.open(path) as pdf:
            page_count = len(pdf.pages)
            for page in pdf.pages[:max_pages]:
                text = page.extract_text() or ""
                chars_extracted += len(text)
                pages_scanned += 1
                lines = [line.strip() for line in text.splitlines() if line.strip()]
                for line in lines:
                    lower = line.lower()
                    if len(snippets["denial_phrases"]) < 8 and any(re.search(p, lower, re.I) for p in DENIAL_PATTERNS.values()):
                        snippets["denial_phrases"].append(line[:300])
                    if len(snippets["appeal_phrases"]) < 8 and any(re.search(p, lower, re.I) for p in PROCESS_PATTERNS.values()):
                        snippets["appeal_phrases"].append(line[:300])
                    if len(snippets["letter_phrases"]) < 8 and any(re.search(p, lower, re.I) for p in LETTER_PATTERNS.values()):
                        snippets["letter_phrases"].append(line[:300])

        return PDFExtractionResult(
            file_path=str(path),
            relative_path=str(path.relative_to(self.corpus_dir)),
            page_count=page_count,
            pages_scanned=pages_scanned,
            chars_extracted=chars_extracted,
            doc_class=doc_class,
            snippets=snippets,
        )

    def _merge_snippets(self, bank: dict[str, list[dict[str, str]]], result: PDFExtractionResult) -> None:
        for key, lines in result.snippets.items():
            for line in lines[:3]:
                if len(bank[key]) >= 25:
                    break
                bank[key].append(
                    {
                        "relative_path": result.relative_path,
                        "doc_class": result.doc_class,
                        "text": line,
                    }
                )

    def _document_class(self, path: Path) -> str:
        lower = path.name.lower()
        rel = str(path.relative_to(self.corpus_dir)).lower()
        if "appeal" in lower or "appeals to print" in rel:
            return "appeal"
        if "denial" in lower:
            return "denial"
        if "eob" in lower:
            return "eob"
        if "medical record" in lower:
            return "medical_records"
        if "auth" in lower or "authorization" in lower:
            return "authorization"
        if "order" in lower:
            return "order"
        return "pdf_document"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus-dir", default="/app/Historical_Model_Data/mybox-selected")
    parser.add_argument("--output", default="/app/data/processed/trident_mybox_pdf_learning_summary.json")
    parser.add_argument("--max-pages-general", type=int, default=1)
    parser.add_argument("--max-pages-priority", type=int, default=3)
    parser.add_argument("--per-pdf-timeout-seconds", type=int, default=10)
    args = parser.parse_args()

    learner = PDFCorpusLearner(
        corpus_dir=Path(args.corpus_dir),
        output_path=Path(args.output),
        max_pages_general=args.max_pages_general,
        max_pages_priority=args.max_pages_priority,
        per_pdf_timeout_seconds=args.per_pdf_timeout_seconds,
    )
    summary = learner.run()
    print(json.dumps({
        "pdf_count": summary["pdf_count"],
        "parsed_pdf_count": summary["parsed_pdf_count"],
        "parse_error_count": summary["parse_error_count"],
        "output": str(args.output),
    }))


if __name__ == "__main__":
    main()
