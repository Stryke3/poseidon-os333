"""Isolated local extraction worker. Input/output JSON; no network or model calls.

Every PDF page is read. Pages containing raster scans also receive OCR so a
text header cannot hide a scanned EOB. Partial extractions are explicitly held
for review, rather than silently counting the file as learned.
"""
import base64
import hashlib
import json
import os
import re
import subprocess
import sys

import pymupdf


def extract(content: bytes, mime: str) -> dict:
    digest = hashlib.sha256(content).hexdigest()
    if mime.startswith('text/') or mime in {'application/json', 'application/edi-x12'}:
        text = content.decode('utf-8-sig')
        return dict(status='EXTRACTED' if text.strip() else 'NEEDS_REVIEW', text=text,
                    sha256=digest, page_count=1, extracted_pages=int(bool(text.strip())), ocr_pages=0)
    if not (content.startswith(b'%PDF-') or mime.startswith('image/')):
        return dict(status='UNSUPPORTED_FORMAT', text='', sha256=digest,
                    page_count=0, extracted_pages=0, ocr_pages=0)
    document = pymupdf.open(stream=content, filetype='pdf' if content.startswith(b'%PDF-') else None)
    if document.needs_pass:
        return dict(status='NEEDS_REVIEW', text='', sha256=digest, error='ENCRYPTED_DOCUMENT',
                    page_count=document.page_count, extracted_pages=0, ocr_pages=0)
    if not document.is_pdf:
        document = pymupdf.open('pdf', document.convert_to_pdf())
    output = []; readable = 0; ocr_pages = 0; failures = 0
    for page in document:
        text = page.get_text('text').strip()
        if len(re.findall(r'\w', text)) < 40 or page.get_images():
            try:
                raster = page.get_pixmap(dpi=170, alpha=False).tobytes('png')
                result = subprocess.run(['tesseract', 'stdin', 'stdout', '--psm', '3'],
                                        input=raster, capture_output=True, timeout=30, check=True,
                                        env={**os.environ, 'OMP_THREAD_LIMIT':'1'})
                ocr = result.stdout.decode('utf-8').strip()
                ocr_pages += 1
                if ocr and ocr != text:
                    text = text + '\n' + ocr if text else ocr
            except (OSError, subprocess.SubprocessError):
                failures += 1
        if text:
            readable += 1
            output.append(f'[Page {page.number + 1}]\n{text}')
    return dict(status='EXTRACTED' if readable and not failures else 'NEEDS_REVIEW',
                text='\n\n'.join(output), sha256=digest, page_count=len(document),
                extracted_pages=readable, ocr_pages=ocr_pages,
                error='OCR_INCOMPLETE' if failures else None)


if __name__ == '__main__':
    try:
        data = json.load(sys.stdin)
        result = extract(base64.b64decode(data['content_base64'], validate=True), data['mime_type'])
    except Exception:
        # Never emit document text/identifiers in process errors or application logs.
        result = {'status': 'NEEDS_REVIEW', 'error': 'DOCUMENT_EXTRACTION_FAILED', 'text': ''}
    print(json.dumps(result))
