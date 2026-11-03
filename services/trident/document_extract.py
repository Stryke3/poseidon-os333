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
import math

import pymupdf

PARSER_VERSION = 2
MAX_RASTER_PIXELS = 6_000_000
MAX_RASTER_EDGE = 3200


def raster_page(page, rotation=0):
    # Fax PDFs sometimes declare enormous physical pages. A fixed DPI then
    # allocates gigabytes and times out before OCR sees a single character.
    width, height = max(1,page.rect.width), max(1,page.rect.height)
    scale = min(200/72, MAX_RASTER_EDGE/max(width,height),
                math.sqrt(MAX_RASTER_PIXELS/(width*height)))
    return page.get_pixmap(matrix=pymupdf.Matrix(scale,scale).prerotate(rotation),
                           colorspace=pymupdf.csGRAY,alpha=False).tobytes('png')


def ocr_page(page):
    best = ''; successes = 0
    # Sparse insurance cards and sideways fax scans need a different layout.
    # Retry only weak pages; ordinary packets keep one OCR pass per scan.
    for rotation,layout in ((0,3),(0,11),(90,11),(270,11)):
        try:
            result = subprocess.run(['tesseract','stdin','stdout','--psm',str(layout)],
                input=raster_page(page,rotation),capture_output=True,timeout=25,check=True,
                env={**os.environ,'OMP_THREAD_LIMIT':'1'})
            successes += 1
            text=result.stdout.decode('utf-8').strip()
            if len(re.findall(r'\w',text))>len(re.findall(r'\w',best)):
                best=text
            if len(re.findall(r'\b\w{2,}\b',best))>=12:
                break
        except (OSError,subprocess.SubprocessError,RuntimeError):
            continue
    return best,not bool(successes)


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
    output = []; readable = 0; ocr_pages = 0; failures = []; empty = []
    for page in document:
        text = page.get_text('text').strip()
        # Small letterhead logos do not turn a selectable-text medical record
        # into a scan. A raster body beneath a readable header still needs OCR.
        page_area=max(1,page.rect.width*page.rect.height)
        scanned_body=any(pymupdf.Rect(info['bbox']).get_area()/page_area>=0.08
                         for info in page.get_image_info())
        if len(re.findall(r'\w', text)) < 40 or scanned_body:
            ocr,failed = ocr_page(page)
            ocr_pages += 1
            if ocr and ocr != text:
                text = text + '\n' + ocr if text else ocr
            if failed:
                failures.append(page.number+1)
        if text:
            readable += 1
            output.append(f'[Page {page.number + 1}]\n{text}')
        else:
            empty.append(page.number+1)
    return dict(status='EXTRACTED' if readable and not failures else 'NEEDS_REVIEW',
                text='\n\n'.join(output), sha256=digest, page_count=len(document),
                extracted_pages=readable, ocr_pages=ocr_pages,
                error='OCR_INCOMPLETE' if failures else 'NO_READABLE_CONTENT' if not readable else None,
                details={'parser_version':PARSER_VERSION,'source_bytes':len(content),
                    'failed_pages':failures,'empty_pages':empty,
                    'page_sizes':[[round(p.rect.width),round(p.rect.height)] for p in document]})


if __name__ == '__main__':
    try:
        data = json.load(sys.stdin)
        result = extract(base64.b64decode(data['content_base64'], validate=True), data['mime_type'])
    except Exception:
        # Never emit document text/identifiers in process errors or application logs.
        result = {'status': 'NEEDS_REVIEW', 'error': 'DOCUMENT_EXTRACTION_FAILED', 'text': ''}
    print(json.dumps(result))
