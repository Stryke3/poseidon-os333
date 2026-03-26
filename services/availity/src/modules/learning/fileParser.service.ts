import fs from "node:fs/promises";
import path from "node:path";

export class FileParserService {
  async parseFile(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === ".txt") {
      return this.parseTxt(filePath);
    }

    if (ext === ".pdf") {
      return this.parsePdf(filePath);
    }

    if (ext === ".docx") {
      return this.parseDocx(filePath);
    }

    throw new Error(`Unsupported file type: ${ext}`);
  }

  private async parseTxt(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath, "utf-8");
    return this.normalize(content);
  }

  private async parsePdf(filePath: string): Promise<string> {
    const pdfParse = (await import("pdf-parse")).default;
    const buffer = await fs.readFile(filePath);
    const data = await pdfParse(buffer);
    return this.normalize(data.text);
  }

  private async parseDocx(filePath: string): Promise<string> {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    return this.normalize(result.value);
  }

  private normalize(text: string): string {
    return text
      .replace(/\r/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim();
  }
}

export const fileParserService = new FileParserService();

export type SupportedManualFileExt = "pdf" | "docx" | "txt";

export function manualFileExt(filePath: string): SupportedManualFileExt | null {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "txt" || ext === "text") return "txt";
  return null;
}

export function normalizeWhitespace(input: string): string {
  // Keep ingestion deterministic and excerpt traceable by normalizing with the same strategy.
  return input
    .replace(/\r/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * Extracts and normalizes full manual text from a supported file.
 * (The `ext` arg is retained for compatibility with existing call sites.)
 */
export async function parseManualFileToText(
  absPath: string,
  _ext?: SupportedManualFileExt | null,
): Promise<string> {
  return fileParserService.parseFile(absPath);
}

