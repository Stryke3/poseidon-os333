"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.manualExtension = manualExtension;
exports.extractManualText = extractManualText;
exports.isSupportedManualFile = isSupportedManualFile;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
function manualExtension(filePath) {
    const ext = node_path_1.default.extname(filePath).slice(1).toLowerCase();
    if (ext === "txt" || ext === "text")
        return "txt";
    if (ext === "pdf")
        return "pdf";
    if (ext === "docx")
        return "docx";
    return null;
}
function stripBom(s) {
    if (s.charCodeAt(0) === 0xfeff)
        return s.slice(1);
    return s;
}
async function extractTxt(absPath) {
    const raw = await (0, promises_1.readFile)(absPath, "utf8");
    return stripBom(raw);
}
async function extractPdf(absPath) {
    try {
        const pdfParse = (await import("pdf-parse")).default;
        const buf = await (0, promises_1.readFile)(absPath);
        const res = await pdfParse(buf);
        return typeof res.text === "string" ? res.text : "";
    }
    catch (err) {
        const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
        if (code === "MODULE_NOT_FOUND" || code === "ERR_MODULE_NOT_FOUND") {
            throw new Error("PDF_EXTRACTION_UNAVAILABLE: install dependency `pdf-parse`");
        }
        throw err;
    }
}
async function extractDocx(absPath) {
    try {
        const mammoth = await import("mammoth");
        const buf = await (0, promises_1.readFile)(absPath);
        const res = await mammoth.extractRawText({ buffer: buf });
        return res.value ?? "";
    }
    catch (err) {
        const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
        if (code === "MODULE_NOT_FOUND" || code === "ERR_MODULE_NOT_FOUND") {
            throw new Error("DOCX_EXTRACTION_UNAVAILABLE: install dependency `mammoth`");
        }
        throw err;
    }
}
/**
 * Extracts plain text from a manual file. PDF/DOCX require optional npm dependencies.
 */
async function extractManualText(absPath, ext) {
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
function isSupportedManualFile(filePath) {
    return manualExtension(filePath) != null;
}
//# sourceMappingURL=manualTextExtraction.js.map