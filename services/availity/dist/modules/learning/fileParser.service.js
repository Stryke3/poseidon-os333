"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileParserService = exports.FileParserService = void 0;
exports.manualFileExt = manualFileExt;
exports.normalizeWhitespace = normalizeWhitespace;
exports.parseManualFileToText = parseManualFileToText;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
class FileParserService {
    async parseFile(filePath) {
        const ext = node_path_1.default.extname(filePath).toLowerCase();
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
    async parseTxt(filePath) {
        const content = await promises_1.default.readFile(filePath, "utf-8");
        return this.normalize(content);
    }
    async parsePdf(filePath) {
        const pdfParse = (await import("pdf-parse")).default;
        const buffer = await promises_1.default.readFile(filePath);
        const data = await pdfParse(buffer);
        return this.normalize(data.text);
    }
    async parseDocx(filePath) {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ path: filePath });
        return this.normalize(result.value);
    }
    normalize(text) {
        return text
            .replace(/\r/g, "\n")
            .replace(/\n{2,}/g, "\n")
            .trim();
    }
}
exports.FileParserService = FileParserService;
exports.fileParserService = new FileParserService();
function manualFileExt(filePath) {
    const ext = node_path_1.default.extname(filePath).slice(1).toLowerCase();
    if (ext === "pdf")
        return "pdf";
    if (ext === "docx")
        return "docx";
    if (ext === "txt" || ext === "text")
        return "txt";
    return null;
}
function normalizeWhitespace(input) {
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
async function parseManualFileToText(absPath, _ext) {
    return exports.fileParserService.parseFile(absPath);
}
//# sourceMappingURL=fileParser.service.js.map