import { extractText, getDocumentProxy, renderPageAsImage } from "unpdf";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

export type PageType = "text" | "image" | "mixed";
export type PageClassification =
  | "demographics"
  | "insurance"
  | "provider order"
  | "clinical note"
  | "diagnosis/coding"
  | "medication"
  | "encounter summary"
  | "lab"
  | "imaging"
  | "other";

export type ExtractedField = {
  field: string;
  value: string;
  confidence: number;
  source_page: number | null;
  source_text: string;
  method: "pdf_text" | "ocr" | "operator";
};

export type PageExtraction = {
  page: number;
  type: PageType;
  text_length: number;
  ocr_required: boolean;
  ocr_attempted: boolean;
  ocr_status: "not_required" | "completed" | "failed" | "blocked";
  classifications: PageClassification[];
  text: string;
  method: "pdf_text" | "ocr" | "mixed" | "none";
  error?: string;
};

export type IntakeExtractionResult = {
  page_count: number;
  extraction_status: "ready_for_review" | "partial_review" | "manual_exception_available" | "failed";
  progress: string[];
  pages: PageExtraction[];
  fields: ExtractedField[];
  combined_text: string;
  warnings: string[];
};

const MIN_TEXT_LENGTH = 40;
const OCR_PAGE_LIMIT = 3;
const execFileAsync = promisify(execFile);

async function recognizeImageBuffer(image: Buffer): Promise<{ text: string; confidence: number }> {
  const tmpPath = path.join(os.tmpdir(), `spear-ocr-${randomUUID()}.png`);
  await fs.writeFile(tmpPath, image);
  try {
    const script = [
      "const Tesseract=require('tesseract.js');",
      "const file=process.argv[1];",
      "Tesseract.recognize(file,'eng').then(r=>{",
      "process.stdout.write(JSON.stringify({text:r.data.text||'',confidence:(r.data.confidence||0)/100}));",
      "}).catch(e=>{process.stderr.write(e&&e.message?e.message:String(e));process.exit(1);});",
    ].join("");
    const { stdout } = await execFileAsync(process.execPath, ["-e", script, tmpPath], {
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 4,
      cwd: process.cwd(),
    });
    return JSON.parse(stdout || "{}") as { text: string; confidence: number };
  } finally {
    await fs.unlink(tmpPath).catch(() => undefined);
  }
}

async function renderWithPoppler(pdf: Buffer, pageNumber: number): Promise<Buffer | null> {
  const pdfPath = path.join(os.tmpdir(), `spear-pdf-${randomUUID()}.pdf`);
  const outPrefix = path.join(os.tmpdir(), `spear-page-${randomUUID()}`);
  const pngPath = `${outPrefix}.png`;
  await fs.writeFile(pdfPath, pdf);
  try {
    await execFileAsync("pdftoppm", ["-png", "-f", String(pageNumber), "-l", String(pageNumber), "-singlefile", "-r", "120", pdfPath, outPrefix], {
      timeout: 15000,
      maxBuffer: 1024 * 512,
    });
    return await fs.readFile(pngPath);
  } catch {
    return null;
  } finally {
    await fs.unlink(pdfPath).catch(() => undefined);
    await fs.unlink(pngPath).catch(() => undefined);
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function excerpt(text: string, value: string) {
  const normalized = text.replace(/\s+/g, " ");
  const index = normalized.toLowerCase().indexOf(value.toLowerCase());
  if (index === -1) return clean(normalized.slice(0, 160));
  return clean(normalized.slice(Math.max(0, index - 60), index + value.length + 90));
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) return clean(match[1]);
  }
  return "";
}

const NAME_LABEL_WORDS = new Set([
  "address",
  "addresses",
  "cell",
  "city",
  "company",
  "default",
  "email",
  "ethnicity",
  "fax",
  "home",
  "insurance",
  "language",
  "mailing",
  "member",
  "mrn",
  "phone",
  "prefix",
  "previous",
  "provider",
  "referring",
  "rendering",
  "sex",
  "ssn",
  "state",
  "status",
  "suffix",
  "work",
  "zip",
]);

function meaningfulLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => clean(line.replace(/^--- PAGE \d+ ---$/i, "")))
    .filter(Boolean);
}

function cleanPersonName(value: string) {
  return clean(value)
    .replace(/\b(?:DOB|D\.O\.B\.|MRN|I AC|Sex|Home Phone|Cell Phone|Work Phone|Previous Name|Prefix|Suffix|Email|Primary Insurance|Insurance|Payer|Provider|NPI)\b.*$/i, "")
    .replace(/\b\d{1,3}\s*Y(?:ears?)?\b.*$/i, "")
    .replace(/[^A-Za-z ,.'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyPersonName(value: string) {
  const cleaned = cleanPersonName(value);
  if (!cleaned || cleaned.length < 5 || cleaned.length > 80) return false;
  if (/\d|@|:/.test(cleaned)) return false;
  const parts = cleaned.replace(",", " ").split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 5) return false;
  return parts.every((part) => {
    const lower = part.toLowerCase().replace(/[^a-z]/g, "");
    return lower.length > 1 && !NAME_LABEL_WORDS.has(lower);
  });
}

function extractPatientName(text: string) {
  const fullTextPatterns = [
    /Patient\s+Medical\s+Record\s+([A-Z][A-Z' -]{1,40},\s*[A-Z][A-Z .'-]{1,40})\b/i,
    /\b([A-Z][A-Z' -]{1,40},\s*[A-Z][A-Z .'-]{1,40})\s+\d{1,3}\s*Y\b/i,
    /patient\s*name\s*[:#-]\s*([A-Z][A-Z ,.'-]{2,80})/i,
    /\bname\s*[:#-]\s*([A-Z][A-Z ,.'-]{2,80})/i,
  ];
  for (const pattern of fullTextPatterns) {
    const value = cleanPersonName(firstMatch(text, [pattern]));
    if (isLikelyPersonName(value)) return value;
  }

  for (const line of meaningfulLines(text).slice(0, 80)) {
    const candidates = [
      line.match(/^([A-Z][A-Z' -]{1,40},\s*[A-Z][A-Z .'-]{1,40})\b/)?.[1],
      line.match(/\b([A-Z][A-Z' -]{1,40},\s*[A-Z][A-Z .'-]{1,40})\s+\d{1,3}\s*Y\b/i)?.[1],
    ].filter(Boolean) as string[];
    for (const candidate of candidates) {
      const value = cleanPersonName(candidate);
      if (isLikelyPersonName(value)) return value;
    }
  }
  return "";
}

function splitPatientName(patientName: string) {
  const cleaned = cleanPersonName(patientName);
  if (!cleaned) return { firstName: "", lastName: "" };
  if (cleaned.includes(",")) {
    const [last, first] = cleaned.split(",", 2).map((part) => clean(part));
    return { firstName: first || "", lastName: last || "" };
  }
  const parts = cleaned.split(/\s+/);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
}

function cleanPayerName(value: string) {
  return clean(value)
    .replace(/\b(?:Ethnicity|Race|Language|Preferred Language|SSN|Confidence|Subscriber|Member|Group|Policy|DOB|Date Of Birth|Home Phone|Cell Phone|Work Phone|Email)\b.*$/i, "")
    .replace(/[^A-Za-z0-9 &.'()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPayerName(text: string) {
  const patterns = [
    /\bPrimary\s+Insurance\s*[:#-]?\s*([A-Z0-9 &.'()-]{2,90}?)(?=\s+(?:Ethnicity|Race|Language|Preferred Language|SSN|Confidence|Secondary|Subscriber|Member|Group|Policy)\b|$)/i,
    /\bInsurance\s+Carrier\s*[:#-]?\s*([A-Z0-9 &.'()-]{2,90}?)(?=\s+(?:Ethnicity|Race|Language|Preferred Language|SSN|Confidence|Secondary|Subscriber|Member|Group|Policy)\b|$)/i,
    /\bPayer\s*[:#-]\s*([A-Z0-9 &.'()-]{2,90}?)(?=\s+(?:Ethnicity|Race|Language|Preferred Language|SSN|Confidence|Subscriber|Member|Group|Policy)\b|$)/i,
    /\bInsurance\s*[:#-]\s*([A-Z0-9 &.'()-]{2,90}?)(?=\s+(?:Ethnicity|Race|Language|Preferred Language|SSN|Confidence|Subscriber|Member|Group|Policy)\b|$)/i,
  ];
  for (const pattern of patterns) {
    const payer = cleanPayerName(firstMatch(text, [pattern]));
    if (payer && !/^(primary|secondary|member|group|insurance|payer)$/i.test(payer)) return payer;
  }
  return "";
}

function extractMrn(text: string) {
  const value = firstMatch(text, [
    /\(MRN\)\s*[:#-]?\s*([A-Z0-9-]{3,30})/i,
    /\bMRN\s*[:#-]\s*([A-Z0-9-]{3,30})/i,
    /medical\s*record\s*(?:number|#)?\s*[:#-]\s*([A-Z0-9-]{3,30})/i,
  ]);
  return /\d/.test(value) ? value : "";
}

export function extractStructuredFieldsFromText(text: string) {
  const patientName = extractPatientName(text);
  const nameParts = splitPatientName(patientName);
  return {
    patientName,
    firstName: nameParts.firstName,
    lastName: nameParts.lastName,
    mrn: extractMrn(text),
    payer: extractPayerName(text),
  };
}

function allCodes(text: string, pattern: RegExp) {
  return unique(Array.from(text.matchAll(pattern), (match) => match[0].toUpperCase().replace(/\.$/, ""))).slice(0, 12);
}

function classifyPage(text: string): PageClassification[] {
  const lower = text.toLowerCase();
  const classes: PageClassification[] = [];
  if (/patient|dob|date of birth|mrn|address|phone|email/.test(lower)) classes.push("demographics");
  if (/payer|insurance|member|subscriber|group/.test(lower)) classes.push("insurance");
  if (/order|ordering|referring|physician|provider|npi|swo|written order/.test(lower)) classes.push("provider order");
  if (/diagnosis|icd|hcpcs|cpt|procedure|dme/.test(lower)) classes.push("diagnosis/coding");
  if (/assessment|history|clinical|medical necessity|progress note/.test(lower)) classes.push("clinical note");
  if (/medication|rx|prescription|dose/.test(lower)) classes.push("medication");
  if (/encounter|visit summary|chief complaint/.test(lower)) classes.push("encounter summary");
  if (/lab|result|specimen/.test(lower)) classes.push("lab");
  if (/x-ray|mri|ct scan|ultrasound|imaging/.test(lower)) classes.push("imaging");
  return classes.length ? classes : ["other"];
}

function field(
  fieldName: string,
  value: string,
  page: PageExtraction | undefined,
  method: "pdf_text" | "ocr" | "operator",
  confidence: number,
): ExtractedField | null {
  const trimmed = clean(value);
  if (!trimmed) return null;
  return {
    field: fieldName,
    value: trimmed,
    confidence,
    source_page: page?.page ?? null,
    source_text: page ? excerpt(page.text, trimmed) : "",
    method,
  };
}

function findSourcePage(pages: PageExtraction[], value: string) {
  if (!value) return undefined;
  return pages.find((page) => page.text.toLowerCase().includes(value.toLowerCase())) || pages.find((page) => page.text.trim());
}

export function extractNormalizedFields(pages: PageExtraction[]): ExtractedField[] {
  const priorityPages = pages
    .filter((page) => page.classifications.some((c) => ["demographics", "insurance", "provider order", "diagnosis/coding"].includes(c)))
    .concat(pages.filter((page) => page.classifications.every((c) => !["demographics", "insurance", "provider order", "diagnosis/coding"].includes(c))));
  const text = priorityPages.map((page) => `\n--- PAGE ${page.page} ---\n${page.text}`).join("\n");

  const structured = extractStructuredFieldsFromText(text);
  const patientName = structured.patientName;
  const firstName = structured.firstName;
  const lastName = structured.lastName;
  const dob = firstMatch(text, [
    /\bDOB\s*[:#-]\s*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i,
    /date\s*of\s*birth\s*[:#-]\s*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i,
  ]);
  const phone = firstMatch(text, [/\bphone\s*[:#-]\s*(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i]);
  const email = firstMatch(text, [/\bemail\s*[:#-]\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i]);
  const address = firstMatch(text, [
    /\baddress\s*[:#-]\s*([0-9][A-Z0-9 .,#'-]{8,120})/i,
  ]);
  const mrn = structured.mrn;
  const payer = structured.payer;
  const memberId = firstMatch(text, [/member\s*(?:id|#)\s*[:#-]\s*([A-Z0-9-]{4,30})/i, /subscriber\s*(?:id|#)\s*[:#-]\s*([A-Z0-9-]{4,30})/i]);
  const groupNumber = firstMatch(text, [/group\s*(?:number|#|id)?\s*[:#-]\s*([A-Z0-9-]{2,30})/i]);
  const providerName = firstMatch(text, [/(?:ordering|referring|provider|physician)\s*(?:name)?\s*[:#-]\s*([A-Z][A-Z ,.'-]{2,80})/i]);
  const providerNpi = firstMatch(text, [/\bNPI\s*[:#-]?\s*(\d{10})\b/i, /provider[^0-9]{0,24}(\d{10})\b/i]);
  const facilityName = firstMatch(text, [
    /(?:facility|practice|clinic)\s*(?:name)?\s*[:#-]\s*([A-Z][A-Z0-9 &.'-]{2,90})/i,
    /\b(Las Vegas Concierge Orthop(?:a)?edics|LVCO|Concierge Orthop(?:a)?edics)\b/i,
  ]);
  const hcpcs = allCodes(text, /\b[A-Z][0-9]{4}\b/g).join(", ");
  const icd10 = allCodes(text, /\b[A-TV-Z][0-9][0-9AB]\.?[0-9A-Z]{0,4}\b/g)
    .filter((code) => !/^[A-Z][0-9]{4}$/.test(code))
    .join(", ");
  const laterality = firstMatch(text, [/\blaterality\s*[:#-]\s*(left|right|bilateral)/i, /\b(left|right|bilateral)\s+(?:knee|hip|shoulder|ankle|wrist)\b/i]);
  const orderDate = firstMatch(text, [/\border\s*date\s*[:#-]\s*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i, /date\s*of\s*service\s*[:#-]\s*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i]);
  const orderType = firstMatch(text, [/\border\s*type\s*[:#-]\s*([A-Z0-9 /.'-]{2,80})/i, /\bproduct\s*[:#-]\s*([A-Z0-9 /.'-]{2,80})/i]) || (hcpcs ? `HCPCS ${hcpcs.split(",")[0]}` : "");

  const candidates: Array<[string, string, number]> = [
    ["patient_name", patientName, 0.94],
    ["first_name", firstName, 0.9],
    ["last_name", lastName, 0.9],
    ["dob", dob, 0.94],
    ["phone", phone, 0.84],
    ["email", email, 0.84],
    ["address", address, 0.78],
    ["mrn", mrn, 0.86],
    ["payer", payer, 0.88],
    ["member_id", memberId, 0.9],
    ["group_number", groupNumber, 0.78],
    ["provider_name", providerName, 0.84],
    ["provider_npi", providerNpi, 0.94],
    ["facility_name", facilityName, 0.9],
    ["order_type", orderType, 0.78],
    ["product", orderType, 0.78],
    ["hcpcs", hcpcs, 0.86],
    ["icd10", icd10, 0.84],
    ["laterality", laterality, 0.78],
    ["order_date", orderDate, 0.82],
  ];

  return candidates
    .map(([name, value, confidence]) => {
      const source = findSourcePage(priorityPages, value);
      const method = source?.method === "ocr" ? "ocr" : source?.method === "mixed" ? "ocr" : "pdf_text";
      return field(name, value, source, method, confidence);
    })
    .filter((item): item is ExtractedField => Boolean(item));
}

export async function extractIntakeDocument(buffer: Buffer, contentType: string): Promise<IntakeExtractionResult> {
  const progress = ["Inspecting document"];
  const warnings: string[] = [];
  const pages: PageExtraction[] = [];
  const pdfData = new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));

  if (!contentType.includes("pdf")) {
    progress.push("Running image OCR");
    try {
      const result = await recognizeImageBuffer(buffer);
      const text = result.text || "";
      pages.push({
        page: 1,
        type: "image",
        text_length: text.length,
        ocr_required: true,
        ocr_attempted: true,
        ocr_status: text ? "completed" : "failed",
        classifications: classifyPage(text),
        text,
        method: text ? "ocr" : "none",
      });
    } catch (error) {
      warnings.push(`OCR failed: ${error instanceof Error ? error.message : "Unknown OCR error"}`);
      pages.push({
        page: 1,
        type: "image",
        text_length: 0,
        ocr_required: true,
        ocr_attempted: true,
        ocr_status: "failed",
        classifications: ["other"],
        text: "",
        method: "none",
      });
    }
  } else {
    progress.push("Extracting embedded text");
    let totalPages = 1;
    let pageTexts: string[] = [];
    let pdfProxy: Awaited<ReturnType<typeof getDocumentProxy>> | null = null;
    try {
      pdfProxy = await getDocumentProxy(pdfData, { disableWorker: true } as never);
      const native = await extractText(pdfProxy, { mergePages: false });
      totalPages = native.totalPages || native.text.length || 1;
      pageTexts = native.text || [];
    } catch (error) {
      const message = error instanceof Error ? error.message : "PDF text extraction failed";
      if (/password|encrypted/i.test(message)) throw new Error("Encrypted/password-protected PDF cannot be processed without a password.");
      warnings.push(message);
    }

    for (let index = 0; index < totalPages; index += 1) {
      const pageNumber = index + 1;
      const nativeText = pageTexts[index] || "";
      const needsOcr = nativeText.trim().length < MIN_TEXT_LENGTH;
      let text = nativeText;
      let ocrStatus: PageExtraction["ocr_status"] = needsOcr ? "blocked" : "not_required";
      let ocrAttempted = false;
      let method: PageExtraction["method"] = nativeText.trim() ? "pdf_text" : "none";

      if (needsOcr && pageNumber <= OCR_PAGE_LIMIT) {
        progress.push(`OCR page ${pageNumber} of ${totalPages}`);
        ocrAttempted = true;
        try {
          const rendered =
            (await renderWithPoppler(buffer, pageNumber)) ||
            Buffer.from(await withTimeout(renderPageAsImage(pdfProxy || pdfData, pageNumber, {
              canvasImport: () => import("@napi-rs/canvas"),
              width: 1000,
            }), 12000, `Page ${pageNumber} render`));
          const result = await recognizeImageBuffer(rendered);
          const ocrText = result.text || "";
          text = [nativeText, ocrText].filter(Boolean).join("\n");
          ocrStatus = ocrText.trim() ? "completed" : "failed";
          method = nativeText.trim() && ocrText.trim() ? "mixed" : ocrText.trim() ? "ocr" : method;
        } catch (error) {
          const message = error instanceof Error ? error.message : "OCR page rendering failed";
          warnings.push(`Page ${pageNumber}: ${message}`);
          ocrStatus = "failed";
        }
      } else if (needsOcr) {
        warnings.push(`Page ${pageNumber}: OCR deferred because page limit ${OCR_PAGE_LIMIT} was reached.`);
      }

      const type: PageType = nativeText.trim().length >= MIN_TEXT_LENGTH && ocrStatus === "completed" ? "mixed" : nativeText.trim().length >= MIN_TEXT_LENGTH ? "text" : "image";
      pages.push({
        page: pageNumber,
        type,
        text_length: text.trim().length,
        ocr_required: needsOcr,
        ocr_attempted: ocrAttempted,
        ocr_status: ocrStatus,
        classifications: classifyPage(text),
        text,
        method,
      });
    }
  }

  progress.push("Classifying pages", "Extracting fields");
  const fields = extractNormalizedFields(pages);
  const combinedText = pages.map((page) => `--- PAGE ${page.page} ---\n${page.text}`).join("\n\n").trim();
  const hasCore = ["patient_name", "dob", "payer", "member_id", "provider_npi"].filter((name) => fields.some((fieldItem) => fieldItem.field === name)).length;
  const extractionStatus: IntakeExtractionResult["extraction_status"] =
    fields.length >= 4 && hasCore >= 3
      ? "ready_for_review"
      : fields.length > 0
        ? "partial_review"
        : warnings.length
          ? "manual_exception_available"
          : "failed";
  progress.push(extractionStatus === "ready_for_review" ? "Ready for review" : "Review required");

  return {
    page_count: pages.length || 1,
    extraction_status: extractionStatus,
    progress,
    pages,
    fields,
    combined_text: combinedText,
    warnings,
  };
}
