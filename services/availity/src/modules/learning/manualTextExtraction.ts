import { readFile } from "node:fs/promises";
import path from "node:path";

export type SupportedManualExt = "txt" | "pdf" | "docx";

export function manualExtension(filePath: string): SupportedManualExt | null {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (ext === "txt" || ext === "text") return "txt";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  return null;
}

function stripBom(s: string): string {
  if (s.charCodeAt(0) === 0xfeff) return s.slice(1);
  return s;
}

async function extractTxt(absPath: string): Promise<string> {
  const raw = await readFile(absPath, "utf8");
  return stripBom(raw);
}

async function extractPdf(absPath: string): Promise<string> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const buf = await readFile(absPath);
    const res = await pdfParse(buf);
    return typeof res.text === "string" ? res.text : "";
  } catch (err: unknown) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
    if (code === "MODULE_NOT_FOUND" || code === "ERR_MODULE_NOT_FOUND") {
      throw new Error("PDF_EXTRACTION_UNAVAILABLE: install dependency `pdf-parse`");
    }
    throw err;
  }
}

async function extractDocx(absPath: string): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const buf = await readFile(absPath);
    const res = await mammoth.extractRawText({ buffer: buf });
    return res.value ?? "";
  } catch (err: unknown) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
    if (code === "MODULE_NOT_FOUND" || code === "ERR_MODULE_NOT_FOUND") {
      throw new Error("DOCX_EXTRACTION_UNAVAILABLE: install dependency `mammoth`");
    }
    throw err;
  }
}

/**
 * Extracts plain text from a manual file. PDF/DOCX require optional npm dependencies.
 */
export async function extractManualText(absPath: string, ext: SupportedManualExt): Promise<string> {
  switch (ext) {
    case "txt":
      return extractTxt(absPath);
    case "pdf":
      return extractPdf(absPath);
    case "docx":
      return extractDocx(absPath);
    default:
      throw new Error(`Unsupported manual type: ${ext}`);
  }
}

export function isSupportedManualFile(filePath: string): boolean {
  return manualExtension(filePath) != null;
}
