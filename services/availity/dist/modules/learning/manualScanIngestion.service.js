"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toPosixRelative = toPosixRelative;
exports.inferPayerKeyFromRelativePath = inferPayerKeyFromRelativePath;
exports.scanAndIngestTridentManuals = scanAndIngestTridentManuals;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const config_js_1 = require("../../config.js");
const logger_js_1 = require("../../lib/logger.js");
const payer_intelligence_audit_js_1 = require("../../lib/payer-intelligence-audit.js");
const governance_constants_js_1 = require("../governance/governance.constants.js");
const manual_requirement_extractor_js_1 = require("../governance/manual-requirement-extractor.js");
const manualTextExtraction_js_1 = require("./manualTextExtraction.js");
/** Normalize relative path to POSIX-style for stable `sourcePath` storage. */
function toPosixRelative(rel) {
    return rel.split(node_path_1.default.sep).filter((p) => p !== "").join("/");
}
/**
 * Payer key from folder layout under the manuals root, or from the filename stem if the file sits at root.
 * Example: `aetna/dme/foo.txt` → `AETNA`; `UnitedHealthcare-guide.pdf` → `UNITEDHEALTHCARE_GUIDE`
 */
function inferPayerKeyFromRelativePath(relativePosixPath) {
    const normalized = relativePosixPath.replace(/^\/+/, "");
    const segments = normalized.split("/").filter(Boolean);
    if (segments.length >= 2) {
        return normalizePayerId(segments[0]);
    }
    const file = segments[0] ?? "manual";
    const stem = node_path_1.default.parse(file).name;
    return normalizePayerId(stem);
}
function normalizePayerId(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        return "UNKNOWN_PAYER";
    const slug = trimmed.replace(/[^a-zA-Z0-9]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
    const upper = slug.toUpperCase();
    return upper || "UNKNOWN_PAYER";
}
async function* walkFiles(dir) {
    const entries = await (0, promises_1.readdir)(dir, { withFileTypes: true });
    for (const ent of entries) {
        if (ent.name.startsWith("."))
            continue;
        const full = node_path_1.default.join(dir, ent.name);
        if (ent.isDirectory()) {
            yield* walkFiles(full);
        }
        else if (ent.isFile() && (0, manualTextExtraction_js_1.isSupportedManualFile)(full)) {
            yield full;
        }
    }
}
function sourceTypeLabel(ext) {
    if (ext === "pdf")
        return "PDF";
    if (ext === "docx")
        return "DOCX";
    if (ext === "txt")
        return "TXT";
    return null;
}
/**
 * Recursively scans `services/trident/manuals` (or `config.governance.tridentManualsRoot`),
 * extracts text, and upserts `PayerManual` rows. Idempotent: same `sourcePath` + `contentFingerprint` → skip.
 * New or changed files get `parsedStatus` **PENDING** (raw text only; no requirement extraction).
 */
async function scanAndIngestTridentManuals(prisma, opts = {}) {
    const root = node_path_1.default.resolve(opts.root ?? config_js_1.config.governance.tridentManualsRoot);
    const actor = opts.actor ?? "manual-scan";
    const failed = [];
    let scannedFiles = 0;
    let skippedUnchanged = 0;
    let inserted = 0;
    let updated = 0;
    try {
        const st = await (0, promises_1.stat)(root);
        if (!st.isDirectory()) {
            return {
                root,
                scannedFiles: 0,
                skippedUnchanged: 0,
                inserted: 0,
                updated: 0,
                failed: [{ relativePath: ".", error: "MANUALS_ROOT_NOT_A_DIRECTORY" }],
            };
        }
    }
    catch (err) {
        logger_js_1.logger.warn({ err, root }, "trident_manuals_root_unreadable");
        return {
            root,
            scannedFiles: 0,
            skippedUnchanged: 0,
            inserted: 0,
            updated: 0,
            failed: [{ relativePath: ".", error: err instanceof Error ? err.message : String(err) }],
        };
    }
    for await (const abs of walkFiles(root)) {
        scannedFiles += 1;
        const rel = node_path_1.default.relative(root, abs);
        const relativePath = toPosixRelative(rel);
        const ext = (0, manualTextExtraction_js_1.manualExtension)(abs);
        if (!ext)
            continue;
        try {
            const rawText = (await (0, manualTextExtraction_js_1.extractManualText)(abs, ext)).trim();
            const contentFingerprint = (0, manual_requirement_extractor_js_1.checksumManualText)(rawText);
            const payerId = inferPayerKeyFromRelativePath(relativePath);
            const title = node_path_1.default.basename(relativePath);
            const sourceType = sourceTypeLabel(ext);
            const existing = await prisma.payerManual.findFirst({
                where: { sourcePath: relativePath },
                select: { id: true, contentFingerprint: true },
            });
            if (existing?.contentFingerprint === contentFingerprint) {
                skippedUnchanged += 1;
                continue;
            }
            if (existing) {
                await prisma.payerManual.update({
                    where: { id: existing.id },
                    data: {
                        payerId,
                        title,
                        sourceType,
                        rawText,
                        contentFingerprint,
                        parsedStatus: governance_constants_js_1.MANUAL_PARSED_STATUS.PENDING,
                        planName: null,
                        versionLabel: null,
                        effectiveDate: null,
                    },
                });
                updated += 1;
            }
            else {
                await prisma.payerManual.create({
                    data: {
                        payerId,
                        title,
                        sourcePath: relativePath,
                        sourceType,
                        planName: null,
                        versionLabel: null,
                        effectiveDate: null,
                        rawText,
                        contentFingerprint,
                        parsedStatus: governance_constants_js_1.MANUAL_PARSED_STATUS.PENDING,
                    },
                });
                inserted += 1;
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            failed.push({ relativePath, error: message });
            logger_js_1.logger.warn({ relativePath, err }, "trident_manual_scan_file_failed");
        }
    }
    await (0, payer_intelligence_audit_js_1.writePayerIntelligenceAudit)(prisma, {
        action: "trident_manuals_scan_completed",
        payerId: null,
        detail: {
            root,
            scannedFiles,
            skippedUnchanged,
            inserted,
            updated,
            failedCount: failed.length,
        },
        actor,
    });
    return {
        root,
        scannedFiles,
        skippedUnchanged,
        inserted,
        updated,
        failed,
    };
}
//# sourceMappingURL=manualScanIngestion.service.js.map