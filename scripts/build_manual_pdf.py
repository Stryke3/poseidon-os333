#!/usr/bin/env python3
"""
Convert docs/MANUAL.md to docs/POSEIDON_MANUAL.pdf using fpdf2.

Usage:  python3 scripts/build_manual_pdf.py
"""

import pathlib, re, textwrap
from fpdf import FPDF

ROOT = pathlib.Path(__file__).resolve().parent.parent
MD_PATH = ROOT / "docs" / "MANUAL.md"
PDF_PATH = ROOT / "docs" / "POSEIDON_MANUAL.pdf"

BLUE = (13, 86, 137)
DARK = (26, 26, 26)
GRAY = (100, 100, 100)
LIGHT_BG = (240, 244, 248)
CODE_BG = (246, 248, 250)
WHITE = (255, 255, 255)
TABLE_BORDER = (204, 204, 204)
STRIPE = (250, 251, 252)


class ManualPDF(FPDF):
    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(*GRAY)
        self.cell(0, 8, "POSEIDON / StrykeFox System Manual", align="L")
        self.ln(10)

    def footer(self):
        if self.page_no() == 1:
            return
        self.set_y(-15)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*GRAY)
        self.cell(0, 10, str(self.page_no()), align="C")


def sanitize(text):
    """Replace characters outside latin-1 range for core PDF fonts."""
    text = text.replace("\u2014", "--").replace("\u2013", "-")
    text = text.replace("\u2018", "'").replace("\u2019", "'")
    text = text.replace("\u201c", '"').replace("\u201d", '"')
    text = text.replace("\u2022", "-").replace("\u2026", "...")
    text = text.replace("\u2192", "->").replace("\u2190", "<-")
    try:
        text.encode("latin-1")
    except UnicodeEncodeError:
        text = text.encode("latin-1", errors="replace").decode("latin-1")
    return text


def strip_inline(text):
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    text = re.sub(r"`(.+?)`", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    return sanitize(text.strip())


def bold_segments(text):
    """Yield (is_bold, is_code, content) tuples for inline formatting."""
    parts = re.split(r"(\*\*.*?\*\*|`[^`]+`)", text)
    for p in parts:
        if not p:
            continue
        if p.startswith("**") and p.endswith("**"):
            yield True, False, p[2:-2]
        elif p.startswith("`") and p.endswith("`"):
            yield False, True, p[1:-1]
        else:
            yield False, False, p


def write_rich_line(pdf, text, base_size=10):
    """Write a single line with bold/code inline formatting."""
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    for is_bold, is_code, chunk in bold_segments(text):
        if is_code:
            pdf.set_font("Courier", "", base_size - 1)
            pdf.set_text_color(60, 60, 60)
        elif is_bold:
            pdf.set_font("Helvetica", "B", base_size)
            pdf.set_text_color(*DARK)
        else:
            pdf.set_font("Helvetica", "", base_size)
            pdf.set_text_color(*DARK)
        pdf.write(5, sanitize(chunk))
    pdf.ln(5)


def render_table(pdf, header_line, rows):
    """Render a markdown table."""
    def parse_row(line):
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        return cells

    headers = parse_row(header_line)
    n_cols = len(headers)
    usable = pdf.w - pdf.l_margin - pdf.r_margin
    col_w = usable / n_cols

    need_height = 8 + len(rows) * 7 + 4
    if pdf.get_y() + need_height > pdf.h - 25:
        pdf.add_page()

    pdf.set_font("Helvetica", "B", 8.5)
    pdf.set_fill_color(*LIGHT_BG)
    pdf.set_text_color(*BLUE)
    pdf.set_draw_color(*TABLE_BORDER)
    for i, h in enumerate(headers):
        pdf.cell(col_w, 7, strip_inline(h), border=1, fill=True, align="L")
    pdf.ln()

    pdf.set_font("Helvetica", "", 8.5)
    pdf.set_text_color(*DARK)
    for row_idx, row_line in enumerate(rows):
        cells = parse_row(row_line)
        while len(cells) < n_cols:
            cells.append("")
        if row_idx % 2 == 1:
            pdf.set_fill_color(*STRIPE)
            fill = True
        else:
            pdf.set_fill_color(*WHITE)
            fill = True
        for i, c in enumerate(cells):
            pdf.cell(col_w, 6.5, strip_inline(c)[:80], border=1, fill=fill, align="L")
        pdf.ln()
    pdf.ln(3)


def build():
    pdf = ManualPDF(orientation="P", unit="mm", format="Letter")
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.set_left_margin(18)
    pdf.set_right_margin(18)

    # --- Cover page ---
    pdf.add_page()
    pdf.ln(70)
    pdf.set_font("Helvetica", "B", 34)
    pdf.set_text_color(*BLUE)
    pdf.cell(0, 14, "POSEIDON", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 18)
    pdf.set_text_color(*DARK)
    pdf.cell(0, 10, "System Manual", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)
    pdf.set_font("Helvetica", "I", 13)
    pdf.set_text_color(*GRAY)
    pdf.cell(0, 8, "Healthcare Revenue Cycle Management Platform", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, "CRM meets EMR", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(14)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(*GRAY)
    pdf.cell(0, 8, "StrykeFox  |  v2.0  |  April 2026", align="C", new_x="LMARGIN", new_y="NEXT")

    # --- Parse and render body ---
    md = MD_PATH.read_text(encoding="utf-8")
    lines = md.split("\n")

    i = 0
    in_code_block = False
    code_buf = []
    in_table = False
    table_header = ""
    table_rows = []

    while i < len(lines):
        line = lines[i]

        # Fenced code blocks
        if line.strip().startswith("```"):
            if not in_code_block:
                in_code_block = True
                code_buf = []
                i += 1
                continue
            else:
                in_code_block = False
                if code_buf:
                    if pdf.get_y() + len(code_buf) * 4 + 10 > pdf.h - 25:
                        pdf.add_page()
                    pdf.set_fill_color(*CODE_BG)
                    pdf.set_draw_color(225, 228, 232)
                    block_h = len(code_buf) * 4.2 + 6
                    y0 = pdf.get_y()
                    pdf.rect(pdf.l_margin, y0, pdf.w - pdf.l_margin - pdf.r_margin, block_h, style="DF")
                    pdf.set_xy(pdf.l_margin + 3, y0 + 2)
                    pdf.set_font("Courier", "", 7.5)
                    pdf.set_text_color(50, 50, 50)
                    for cl in code_buf:
                        pdf.cell(0, 4.2, sanitize(cl[:120]))
                        pdf.ln(4.2)
                    pdf.set_y(y0 + block_h + 2)
                code_buf = []
                i += 1
                continue

        if in_code_block:
            code_buf.append(line)
            i += 1
            continue

        # Table detection
        if "|" in line and not line.strip().startswith("```"):
            cells_test = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells_test) >= 2:
                if not in_table:
                    in_table = True
                    table_header = line
                    table_rows = []
                    i += 1
                    continue
                else:
                    if re.match(r"^[\s|:-]+$", line):
                        i += 1
                        continue
                    table_rows.append(line)
                    i += 1
                    continue

        if in_table:
            render_table(pdf, table_header, table_rows)
            in_table = False
            table_header = ""
            table_rows = []

        # Skip the title line (cover handles it) and ToC anchor links
        if i < 10 and (line.startswith("# ") or line.startswith("**Healthcare") or line.startswith("*CRM")):
            i += 1
            continue

        # Horizontal rule
        if line.strip() in ("---", "***", "___"):
            pdf.ln(3)
            y = pdf.get_y()
            pdf.set_draw_color(210, 210, 210)
            pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
            pdf.ln(4)
            i += 1
            continue

        # Headings
        m = re.match(r"^(#{1,4})\s+(.+)", line)
        if m:
            level = len(m.group(1))
            text = strip_inline(m.group(2))

            if level == 1:
                pdf.add_page()
                pdf.ln(4)
                pdf.set_font("Helvetica", "B", 20)
                pdf.set_text_color(*BLUE)
                pdf.cell(0, 10, text, new_x="LMARGIN", new_y="NEXT")
                y = pdf.get_y()
                pdf.set_draw_color(*BLUE)
                pdf.set_line_width(0.5)
                pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
                pdf.set_line_width(0.2)
                pdf.ln(4)
            elif level == 2:
                if pdf.get_y() > pdf.h - 50:
                    pdf.add_page()
                pdf.ln(6)
                pdf.set_font("Helvetica", "B", 14)
                pdf.set_text_color(*BLUE)
                pdf.cell(0, 8, text, new_x="LMARGIN", new_y="NEXT")
                y = pdf.get_y()
                pdf.set_draw_color(*TABLE_BORDER)
                pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
                pdf.ln(3)
            elif level == 3:
                if pdf.get_y() > pdf.h - 40:
                    pdf.add_page()
                pdf.ln(4)
                pdf.set_font("Helvetica", "B", 11.5)
                pdf.set_text_color(50, 50, 50)
                pdf.cell(0, 7, text, new_x="LMARGIN", new_y="NEXT")
                pdf.ln(2)
            else:
                pdf.ln(3)
                pdf.set_font("Helvetica", "B", 10)
                pdf.set_text_color(*GRAY)
                pdf.cell(0, 6, text, new_x="LMARGIN", new_y="NEXT")
                pdf.ln(1)
            i += 1
            continue

        # Bullet / numbered list
        lm = re.match(r"^(\s*)[-*]\s+(.+)", line) or re.match(r"^(\s*)\d+\.\s+(.+)", line)
        if lm:
            indent = len(lm.group(1)) // 2
            text = lm.group(2)
            pdf.set_font("Helvetica", "", 9.5)
            pdf.set_text_color(*DARK)
            x_off = pdf.l_margin + 4 + indent * 5
            pdf.set_x(x_off)
            bullet = "- " if "-" in line[:4] or "*" in line[:4] else ""
            if not bullet:
                nm = re.match(r"\d+\.", line.strip())
                bullet = nm.group() + " " if nm else ""
            plain = strip_inline(text)
            avail = pdf.w - x_off - pdf.r_margin
            wrapped = textwrap.wrap(bullet + plain, width=int(avail / 1.85))
            for wl in wrapped:
                if pdf.get_y() > pdf.h - 20:
                    pdf.add_page()
                pdf.set_x(x_off)
                pdf.cell(0, 5, sanitize(wl))
                pdf.ln(5)
            i += 1
            continue

        # Blank line
        if not line.strip():
            pdf.ln(2)
            i += 1
            continue

        # Regular paragraph
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(*DARK)
        write_rich_line(pdf, line, base_size=10)
        i += 1

    # Flush trailing table
    if in_table:
        render_table(pdf, table_header, table_rows)

    pdf.output(str(PDF_PATH))
    size_kb = PDF_PATH.stat().st_size / 1024
    print(f"PDF written: {PDF_PATH}  ({size_kb:.0f} KB)")


if __name__ == "__main__":
    build()
