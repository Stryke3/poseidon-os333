import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { SpearCase } from "@/lib/poseidon-store";
import { applyUniversalE0676 } from "@/lib/spear-e0676";

type PacketKind =
  | "coding_cover"
  | "provider_swo"
  | "payer_addendum"
  | "billing_packet"
  | "pod"
  | "final_bill_ready_packet";

type PacketInput = {
  caseRecord: SpearCase;
  kind: PacketKind;
  title: string;
  subtitle?: string;
  watermark?: string;
  sections?: Array<{ heading: string; lines: string[] }>;
};

type Fonts = { regular: PDFFont; bold: PDFFont };
type HcpcsLine = {
  code: string;
  modifier: string;
  units: string;
  schedule: string;
  description: string;
  notes: string;
};

const PAGE = { width: 612, height: 792, margin: 42 };
const navy = rgb(0.04, 0.08, 0.15);
const blue = rgb(0.15, 0.39, 0.92);
const slate = rgb(0.31, 0.37, 0.47);
const lightBlue = rgb(0.93, 0.96, 1);
const border = rgb(0.82, 0.86, 0.91);
const red = rgb(0.72, 0.11, 0.11);

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return value.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function val(value: unknown, fallback = "Missing") {
  const text = Array.isArray(value) ? value.join(", ") : String(value || "").trim();
  return text || fallback;
}

function effectiveHcpcs(caseRecord: SpearCase): string[] {
  return [
    caseRecord.final_hcpcs,
    caseRecord.operator_approved_hcpcs,
    caseRecord.trident_recommended_hcpcs,
    caseRecord.source_hcpcs,
    caseRecord.hcpcs,
  ].map(asList).find((items) => items.length) || [];
}

function lineItems(caseRecord: SpearCase): HcpcsLine[] {
  return applyUniversalE0676(effectiveHcpcs(caseRecord).map((code) => ({ code, hcpcs: code, quantity: 1 })), caseRecord.payer)
    .map((item) => {
      const row = item as Record<string, unknown>;
      const months = Number(row.billing_months || row.rental_months || 0);
      const frequency = String(row.billing_frequency || "");
      return {
        code: String(row.hcpcs || row.code || ""),
        modifier: String(row.modifier || ""),
        units: String(row.units || row.quantity || 1),
        schedule: months > 1 ? `${months} mo rental` : frequency || "single",
        description: String(row.description || "DME item"),
        notes: String(row.notes || ""),
      };
    })
    .filter((item) => item.code);
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function drawText(page: PDFPage, text: string, x: number, y: number, opts: { font: PDFFont; size?: number; color?: ReturnType<typeof rgb>; maxWidth?: number; lineHeight?: number }) {
  const size = opts.size || 10;
  const lines = opts.maxWidth ? wrapText(text, opts.font, size, opts.maxWidth) : [text];
  let cursor = y;
  for (const line of lines) {
    page.drawText(line, { x, y: cursor, size, font: opts.font, color: opts.color || navy });
    cursor -= opts.lineHeight || size + 4;
  }
  return cursor;
}

function drawHeader(page: PDFPage, fonts: Fonts, title: string, subtitle: string) {
  page.drawRectangle({ x: 0, y: PAGE.height - 84, width: PAGE.width, height: 84, color: navy });
  page.drawText("SPEAR", { x: PAGE.margin, y: PAGE.height - 38, size: 22, font: fonts.bold, color: rgb(1, 1, 1) });
  page.drawText("DOCUMENT EXECUTION ENGINE", { x: PAGE.margin + 88, y: PAGE.height - 34, size: 8, font: fonts.regular, color: rgb(0.78, 0.84, 0.92) });
  page.drawText(title, { x: PAGE.margin, y: PAGE.height - 64, size: 13, font: fonts.bold, color: rgb(1, 1, 1) });
  page.drawText(subtitle, { x: PAGE.margin + 220, y: PAGE.height - 64, size: 9, font: fonts.regular, color: rgb(0.78, 0.84, 0.92) });
}

function drawFooter(page: PDFPage, fonts: Fonts, index: number, total: number, watermark?: string) {
  page.drawLine({ start: { x: PAGE.margin, y: 46 }, end: { x: PAGE.width - PAGE.margin, y: 46 }, thickness: 0.6, color: border });
  page.drawText(`StrykeFox Medical - SPEAR - Page ${index} of ${total}`, { x: PAGE.margin, y: 28, size: 8, font: fonts.regular, color: slate });
  page.drawText("Generated packet - signature required where indicated", { x: PAGE.width - 260, y: 28, size: 8, font: fonts.regular, color: slate });
  if (watermark) {
    const size = 28;
    const textWidth = fonts.bold.widthOfTextAtSize(watermark, size);
    page.drawText(watermark, {
      x: Math.max(36, (PAGE.width - textWidth) / 2),
      y: PAGE.height / 2,
      size,
      font: fonts.bold,
      color: rgb(0.82, 0.86, 0.91),
      opacity: 0.35,
    });
  }
}

function drawPanel(page: PDFPage, fonts: Fonts, heading: string, x: number, y: number, width: number, rows: Array<[string, string]>) {
  const rowHeight = 23;
  const height = 28 + rows.length * rowHeight;
  page.drawRectangle({ x, y: y - height, width, height, borderColor: border, borderWidth: 1, color: rgb(1, 1, 1) });
  page.drawRectangle({ x, y: y - 24, width, height: 24, color: lightBlue });
  page.drawText(heading, { x: x + 12, y: y - 17, size: 9, font: fonts.bold, color: blue });
  let cursor = y - 38;
  for (const [label, value] of rows) {
    page.drawText(label.toUpperCase(), { x: x + 12, y: cursor + 7, size: 6, font: fonts.bold, color: slate });
    drawText(page, value, x + 12, cursor - 5, { font: fonts.bold, size: 8.5, maxWidth: width - 24, lineHeight: 9 });
    page.drawLine({ start: { x: x + 12, y: cursor - 12 }, end: { x: x + width - 12, y: cursor - 12 }, thickness: 0.35, color: border });
    cursor -= rowHeight;
  }
  return y - height - 16;
}

function drawLineTable(page: PDFPage, fonts: Fonts, x: number, y: number, width: number, rows: HcpcsLine[]) {
  const columns = [58, 56, 48, 82, width - 58 - 56 - 48 - 82];
  const headerHeight = 20;
  const rowHeight = 28;
  const height = headerHeight + Math.max(rows.length, 1) * rowHeight + 10;
  page.drawRectangle({ x, y: y - height, width, height, borderColor: border, borderWidth: 1, color: rgb(1, 1, 1) });
  page.drawRectangle({ x, y: y - headerHeight, width, height: headerHeight, color: navy });
  let cursorX = x + 8;
  const headers = ["HCPCS", "MOD", "UNITS", "SCHEDULE", "DESCRIPTION"];
  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index];
    page.drawText(header, { x: cursorX, y: y - 14, size: 6.5, font: fonts.bold, color: rgb(1, 1, 1) });
    cursorX += columns[index];
  }

  let cursorY = y - headerHeight - 20;
  const tableRows = rows.length ? rows : [{ code: "Missing", modifier: "", units: "", schedule: "", description: "Missing HCPCS lines", notes: "" }];
  for (const item of tableRows) {
    cursorX = x + 8;
    const values = [item.code, item.modifier, item.units, item.schedule, item.description];
    for (let i = 0; i < values.length; i += 1) {
      drawText(page, values[i], cursorX, cursorY, { font: i < 2 ? fonts.bold : fonts.regular, size: 8, maxWidth: columns[i] - 8, lineHeight: 9 });
      cursorX += columns[i];
    }
    page.drawLine({ start: { x: x + 8, y: cursorY - 12 }, end: { x: x + width - 8, y: cursorY - 12 }, thickness: 0.35, color: border });
    cursorY -= rowHeight;
  }
  return y - height - 16;
}

function drawChecklist(page: PDFPage, fonts: Fonts, x: number, y: number, width: number, heading: string, items: string[]) {
  const height = 26 + items.length * 16;
  page.drawRectangle({ x, y: y - height, width, height, borderColor: border, borderWidth: 1, color: rgb(1, 1, 1) });
  page.drawText(heading, { x: x + 12, y: y - 18, size: 10, font: fonts.bold, color: navy });
  let cursor = y - 36;
  for (const item of items) {
    page.drawRectangle({ x: x + 12, y: cursor - 2, width: 9, height: 9, borderColor: slate, borderWidth: 0.8 });
    drawText(page, item, x + 28, cursor, { font: fonts.regular, size: 8, maxWidth: width - 42, lineHeight: 9 });
    cursor -= 16;
  }
  return y - height - 16;
}

function drawSignatureBlock(page: PDFPage, fonts: Fonts, x: number, y: number, width: number, signerLabel: string) {
  const height = 74;
  page.drawRectangle({ x, y: y - height, width, height, borderColor: border, borderWidth: 1, color: rgb(1, 1, 1) });
  page.drawText(signerLabel, { x: x + 12, y: y - 17, size: 9.5, font: fonts.bold, color: navy });
  page.drawLine({ start: { x: x + 12, y: y - 42 }, end: { x: x + width - 150, y: y - 42 }, thickness: 0.8, color: navy });
  page.drawText("Signature", { x: x + 12, y: y - 54, size: 7.5, font: fonts.regular, color: slate });
  page.drawLine({ start: { x: x + width - 126, y: y - 42 }, end: { x: x + width - 18, y: y - 42 }, thickness: 0.8, color: navy });
  page.drawText("Date", { x: x + width - 126, y: y - 54, size: 7.5, font: fonts.regular, color: slate });
  page.drawText("Printed name: ________________________________", { x: x + 12, y: y - 66, size: 8, font: fonts.regular, color: navy });
  return y - height - 16;
}

function drawNarrativeBox(page: PDFPage, fonts: Fonts, x: number, y: number, width: number, heading: string, lines: string[]) {
  const wrapped = lines.flatMap((line) => wrapText(line, fonts.regular, 9, width - 24));
  const height = Math.max(54, 30 + wrapped.length * 10);
  page.drawRectangle({ x, y: y - height, width, height, borderColor: border, borderWidth: 1, color: rgb(1, 1, 1) });
  page.drawText(heading, { x: x + 12, y: y - 18, size: 10, font: fonts.bold, color: blue });
  let cursor = y - 35;
  for (const line of wrapped) {
    page.drawText(line, { x: x + 12, y: cursor, size: 8, font: fonts.regular, color: navy });
    cursor -= 10;
  }
  return y - height - 16;
}

function headerSubtitle(caseRecord: SpearCase) {
  return `${val(caseRecord.patient_name, "Patient")} | DOB ${val(caseRecord.dob)} | ${val(caseRecord.payer)}`;
}

function patientRows(caseRecord: SpearCase): Array<[string, string]> {
  return [
    ["Patient", val(caseRecord.patient_name)],
    ["DOB", val(caseRecord.dob)],
    ["MRN", val(caseRecord.mrn, "Not supplied")],
    ["Phone", val(caseRecord.phone, "Not supplied")],
    ["Address", val(caseRecord.address, "Not supplied")],
  ];
}

function orderRows(caseRecord: SpearCase): Array<[string, string]> {
  return [
    ["Payer", val(caseRecord.payer)],
    ["Member ID", val(caseRecord.member_id)],
    ["Provider", val(caseRecord.provider)],
    ["Provider NPI", val(caseRecord.npi)],
    ["Order Date", val(caseRecord.order_date)],
    ["Laterality", val(caseRecord.laterality)],
    ["ICD-10", asList(caseRecord.final_icd || caseRecord.operator_approved_icd || caseRecord.trident_recommended_icd || caseRecord.source_icd || caseRecord.icd).join(", ") || "Missing"],
  ];
}

function drawTopPanels(page: PDFPage, fonts: Fonts, caseRecord: SpearCase) {
  const leftWidth = 250;
  const rightWidth = PAGE.width - PAGE.margin * 2 - leftWidth - 16;
  drawPanel(page, fonts, "Patient", PAGE.margin, 680, leftWidth, patientRows(caseRecord));
  return drawPanel(page, fonts, "Order / Insurance", PAGE.margin + leftWidth + 16, 680, rightWidth, orderRows(caseRecord));
}

function drawCodingCover(page: PDFPage, fonts: Fonts, caseRecord: SpearCase) {
  let y = drawTopPanels(page, fonts, caseRecord);
  y = drawLineTable(page, fonts, PAGE.margin, y, PAGE.width - PAGE.margin * 2, lineItems(caseRecord));
  drawChecklist(page, fonts, PAGE.margin, y, PAGE.width - PAGE.margin * 2, "Billing Gate", [
    "Provider order and signature verified before claim submission.",
    "ICD-10 pointers support each HCPCS line.",
    "POD required before final billing readiness.",
    "Tebra packet is staged only until operator submits in Tebra.",
  ]);
}

function drawProviderSwo(page: PDFPage, fonts: Fonts, caseRecord: SpearCase) {
  let y = drawTopPanels(page, fonts, caseRecord);
  y = drawLineTable(page, fonts, PAGE.margin, y, PAGE.width - PAGE.margin * 2, lineItems(caseRecord));
  y = drawNarrativeBox(page, fonts, PAGE.margin, y, PAGE.width - PAGE.margin * 2, "Standard Written Order Attestation", [
    "I certify that the listed DME/orthotic items are ordered for home use and are medically necessary for the patient identified above.",
    "E0676 is included on this order. Medicare packets use RR over 13 monthly rental periods; non-Medicare packets use NU, 1 unit.",
  ]);
  drawSignatureBlock(page, fonts, PAGE.margin, y, PAGE.width - PAGE.margin * 2, "Ordering Provider Signature");
}

function drawLmn(page: PDFPage, fonts: Fonts, caseRecord: SpearCase) {
  let y = drawTopPanels(page, fonts, caseRecord);
  y = drawNarrativeBox(page, fonts, PAGE.margin, y, PAGE.width - PAGE.margin * 2, "Letter of Medical Necessity", [
    `The patient has documented diagnosis support of ${asList(caseRecord.icd).join(", ") || "the listed clinical condition"} with ${val(caseRecord.laterality, "applicable")} laterality.`,
    `Requested product/order: ${val(caseRecord.product || caseRecord.order_type, "DME/orthotic recovery support")}.`,
    "The ordered items support home recovery, mobility limitation, pain-control workflow, compression/DVT risk mitigation, and provider-directed post-operative care.",
    "Medical necessity and patient care determinations remain with the ordering provider.",
  ]);
  y = drawLineTable(page, fonts, PAGE.margin, y, PAGE.width - PAGE.margin * 2, lineItems(caseRecord));
  drawChecklist(page, fonts, PAGE.margin, y, PAGE.width - PAGE.margin * 2, "Documentation Checklist", [
    "Signed SWO attached or pending provider signature.",
    "Clinical note/addendum supports ordered items.",
    "Payer/member identifiers are present.",
    "Proof of delivery required before bill-ready status.",
  ]);
}

function drawDelivery(page: PDFPage, fonts: Fonts, caseRecord: SpearCase) {
  let y = drawTopPanels(page, fonts, caseRecord);
  y = drawLineTable(page, fonts, PAGE.margin, y, PAGE.width - PAGE.margin * 2, lineItems(caseRecord));
  y = drawNarrativeBox(page, fonts, PAGE.margin, y, PAGE.width - PAGE.margin * 2, "Delivery Receipt", [
    "The patient/authorized recipient acknowledges receipt of the listed item(s) in usable condition.",
    "Recipient confirms instruction for use was made available where required.",
  ]);
  y = drawSignatureBlock(page, fonts, PAGE.margin, y, PAGE.width - PAGE.margin * 2, "Patient / Authorized Recipient Signature");
  drawChecklist(page, fonts, PAGE.margin, y, PAGE.width - PAGE.margin * 2, "Delivery Verification", [
    "Delivery date entered.",
    "Delivered item serial/lot numbers recorded where applicable.",
    "Recipient relationship documented if signed by representative.",
  ]);
}

function drawBilling(page: PDFPage, fonts: Fonts, caseRecord: SpearCase) {
  let y = drawTopPanels(page, fonts, caseRecord);
  y = drawLineTable(page, fonts, PAGE.margin, y, PAGE.width - PAGE.margin * 2, lineItems(caseRecord));
  y = drawNarrativeBox(page, fonts, PAGE.margin, y, PAGE.width - PAGE.margin * 2, "CMS-1500 / Tebra Staging Notes", [
    "Place of Service: 12 - Home unless updated by billing operator.",
    "Submission state: Tebra-ready metadata staged only. No payer or Tebra API submission made by this packet.",
  ]);
  drawChecklist(page, fonts, PAGE.margin, y, PAGE.width - PAGE.margin * 2, "Pre-Submission Gate", [
    "Signed SWO captured.",
    "POD captured.",
    "Line modifiers reviewed.",
    "Member ID and payer verified.",
  ]);
}

function drawFinalPacket(page: PDFPage, fonts: Fonts, caseRecord: SpearCase) {
  let y = drawTopPanels(page, fonts, caseRecord);
  y = drawChecklist(page, fonts, PAGE.margin, y, PAGE.width - PAGE.margin * 2, "Final Bill-Ready Packet Contents", [
    "Signed SWO captured.",
    "Billing packet generated.",
    "POD generated and signed.",
    "Tebra staging metadata created.",
    "Operator final review completed.",
  ]);
  y = drawLineTable(page, fonts, PAGE.margin, y, PAGE.width - PAGE.margin * 2, lineItems(caseRecord));
  drawNarrativeBox(page, fonts, PAGE.margin, y, PAGE.width - PAGE.margin * 2, "Billing Status", [
    "READY TO BILL. This is staging readiness only, not proof of payer submission or payment.",
  ]);
}

function drawGenericSections(page: PDFPage, fonts: Fonts, input: PacketInput) {
  let y = drawTopPanels(page, fonts, input.caseRecord);
  const sections = input.sections || [];
  for (const section of sections) {
    y = drawNarrativeBox(page, fonts, PAGE.margin, y, PAGE.width - PAGE.margin * 2, section.heading, section.lines);
  }
}

export async function buildConveyorPacket(input: PacketInput): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  drawHeader(page, fonts, input.title, input.subtitle || headerSubtitle(input.caseRecord));

  if (input.sections?.length) drawGenericSections(page, fonts, input);
  else if (input.kind === "coding_cover") drawCodingCover(page, fonts, input.caseRecord);
  else if (input.kind === "provider_swo") drawProviderSwo(page, fonts, input.caseRecord);
  else if (input.kind === "payer_addendum") drawLmn(page, fonts, input.caseRecord);
  else if (input.kind === "pod") drawDelivery(page, fonts, input.caseRecord);
  else if (input.kind === "billing_packet") drawBilling(page, fonts, input.caseRecord);
  else if (input.kind === "final_bill_ready_packet") drawFinalPacket(page, fonts, input.caseRecord);

  const pages = pdf.getPages();
  for (let index = 0; index < pages.length; index += 1) {
    drawFooter(pages[index], fonts, index + 1, pages.length, input.watermark);
  }

  return Buffer.from(await pdf.save());
}

export function packetFilename(caseRecord: SpearCase, suffix: string) {
  const patient = (caseRecord.patient_name || caseRecord.id).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `${patient || "SPEAR_CASE"}_${suffix}.pdf`;
}
