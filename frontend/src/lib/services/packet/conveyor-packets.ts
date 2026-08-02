import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { SpearCase } from "@/lib/poseidon-store";

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

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) return value.split(/[,\s]+/).filter(Boolean);
  return [];
}

function wrapText(text: string, maxChars = 92): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function patientLines(caseRecord: SpearCase) {
  return [
    `Patient: ${caseRecord.patient_name || "Missing"}`,
    `DOB: ${caseRecord.dob || "Missing"}`,
    `Payer: ${caseRecord.payer || "Missing"}`,
    `Member ID: ${caseRecord.member_id || "Missing"}`,
    `Provider: ${caseRecord.provider || "Missing"}`,
    `Provider NPI: ${caseRecord.npi || "Missing"}`,
    `Order Date: ${caseRecord.order_date || "Missing"}`,
    `Laterality: ${caseRecord.laterality || "Missing"}`,
  ];
}

function billingLines(caseRecord: SpearCase) {
  const hcpcs = asList(caseRecord.hcpcs);
  const icd = asList(caseRecord.icd);
  return [
    `HCPCS Lines: ${hcpcs.join(", ") || "Missing"}`,
    `ICD-10 Pointers: ${icd.join(", ") || "Missing"}`,
    "Place of Service: 12 - Home unless updated by billing operator",
    "Submission State: Tebra-ready metadata staged only. No payer or Tebra API submission made.",
  ];
}

function defaultSections(caseRecord: SpearCase, kind: PacketKind) {
  const common = [{ heading: "Case Summary", lines: patientLines(caseRecord) }];
  if (kind === "coding_cover") {
    return [
      ...common,
      { heading: "Coding Cover", lines: billingLines(caseRecord) },
      { heading: "Compliance Note", lines: ["Coding support is operational documentation only. Final billing review remains with authorized billing personnel."] },
    ];
  }
  if (kind === "provider_swo") {
    return [
      ...common,
      { heading: "Standard Written Order", lines: billingLines(caseRecord) },
      { heading: "Provider Signature", lines: ["Physician signature required before claim packet can be marked signed.", "Signature: ________________________________", "Date: __________________"] },
    ];
  }
  if (kind === "payer_addendum") {
    return [
      ...common,
      { heading: "Medical Necessity Rationale", lines: [`Requested product: ${caseRecord.product || "DME/orthotic support"}`, `Diagnosis support: ${asList(caseRecord.icd).join(", ") || "Missing"}`] },
      { heading: "Audit Checklist", lines: ["Signed order present", "Diagnosis supports HCPCS", "Payer/member identifiers present", "Proof of delivery required before final billing"] },
    ];
  }
  if (kind === "pod") {
    return [
      ...common,
      { heading: "Proof of Delivery", lines: [`Items delivered: ${asList(caseRecord.hcpcs).join(", ") || "Missing"}`, "Beneficiary signature required. Do not mark delivered without uploaded signed POD."] },
      { heading: "Recipient Signature", lines: ["Signature: ________________________________", "Date: __________________"] },
    ];
  }
  if (kind === "final_bill_ready_packet") {
    return [
      ...common,
      { heading: "Final Packet Contents", lines: ["Signed SWO captured", "Billing packet generated", "POD generated", "Signed POD captured", "Tebra staging metadata created"] },
      { heading: "Billing Status", lines: ["READY TO BILL. This is staging readiness only, not proof of payer submission or payment."] },
    ];
  }
  return [
    ...common,
    { heading: "CMS-1500 Line Summary", lines: billingLines(caseRecord) },
    { heading: "Tebra Staging", lines: ["Packet metadata prepared for Tebra import. No external Tebra API call has been performed."] },
  ];
}

export async function buildConveyorPacket(input: PacketInput): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = height - 48;

  page.drawText(input.title, { x: 48, y, size: 18, font: bold, color: rgb(0.06, 0.09, 0.16) });
  y -= 22;
  page.drawText(input.subtitle || `SPEAR ${input.kind}`, { x: 48, y, size: 10, font, color: rgb(0.39, 0.45, 0.55) });
  y -= 28;

  const sections = input.sections?.length ? input.sections : defaultSections(input.caseRecord, input.kind);
  for (const section of sections) {
    if (y < 120) {
      y = height - 48;
      pdf.addPage([612, 792]);
    }
    const currentPage = pdf.getPages()[pdf.getPageCount() - 1];
    currentPage.drawText(section.heading, { x: 48, y, size: 12, font: bold, color: rgb(0.15, 0.39, 0.92) });
    y -= 18;
    for (const rawLine of section.lines) {
      for (const line of wrapText(rawLine)) {
        currentPage.drawText(line, { x: 62, y, size: 10, font, color: rgb(0.06, 0.09, 0.16) });
        y -= 14;
      }
    }
    y -= 12;
  }

  const pages = pdf.getPages();
  for (let index = 0; index < pages.length; index += 1) {
    const p = pages[index];
    p.drawText(`StrykeFox Medical - SPEAR Conveyor - Page ${index + 1} of ${pages.length}`, {
      x: 48,
      y: 28,
      size: 8,
      font,
      color: rgb(0.39, 0.45, 0.55),
    });
    if (input.watermark) {
      const watermarkSize = 22;
      const watermarkWidth = bold.widthOfTextAtSize(input.watermark, watermarkSize);
      p.drawText(input.watermark, {
        x: Math.max(36, (width - watermarkWidth) / 2),
        y: height / 2,
        size: watermarkSize,
        font: bold,
        color: rgb(0.88, 0.9, 0.94),
        opacity: 0.45,
      });
    }
  }

  return Buffer.from(await pdf.save());
}

export function packetFilename(caseRecord: SpearCase, suffix: string) {
  const patient = (caseRecord.patient_name || caseRecord.id).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `${patient || "SPEAR_CASE"}_${suffix}.pdf`;
}
