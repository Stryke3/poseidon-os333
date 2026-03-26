"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.manualIngestionService = exports.ManualIngestionService = void 0;
exports.ingestPayerManual = ingestPayerManual;
exports.scanAndIngestLocalPayerManuals = scanAndIngestLocalPayerManuals;
exports.parsePendingPayerManuals = parsePendingPayerManuals;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const config_js_1 = require("../../config.js");
const logger_js_1 = require("../../lib/logger.js");
const prisma_js_1 = require("../../lib/prisma.js");
const payer_intelligence_audit_js_1 = require("../../lib/payer-intelligence-audit.js");
const governance_constants_js_1 = require("../governance/governance.constants.js");
const hash_util_js_1 = require("./hash.util.js");
const manualRequirementExtraction_service_js_1 = require("./manualRequirementExtraction.service.js");
const fileParser_service_js_1 = require("./fileParser.service.js");
async function readManualFile(relativePath) {
    const abs = node_path_1.default.resolve(config_js_1.config.governance.tridentManualsRoot, relativePath);
    const root = node_path_1.default.resolve(config_js_1.config.governance.tridentManualsRoot);
    if (!abs.startsWith(root)) {
        throw new Error("MANUAL_PATH_ESCAPE");
    }
    return (0, promises_1.readFile)(abs, "utf8");
}
function inferSourceType(relativePath, bodyType) {
    if (bodyType)
        return bodyType;
    if (!relativePath)
        return null;
    const lower = relativePath.toLowerCase();
    if (lower.endsWith(".pdf"))
        return "PDF";
    if (lower.endsWith(".docx"))
        return "DOCX";
    if (lower.endsWith(".txt"))
        return "TXT";
    return null;
}
async function ingestPayerManual(prisma, body, actor) {
    let raw;
    let sourcePath;
    if (body.relativePath) {
        raw = await readManualFile(body.relativePath);
        sourcePath = body.relativePath.replace(/\\/g, "/");
    }
    else if (body.rawText) {
        raw = body.rawText;
        sourcePath = undefined;
    }
    else {
        throw new Error("MANUAL_SOURCE_REQUIRED");
    }
    // Ingest + extraction downstream rely on stable whitespace (and excerpt traceability).
    const normalizedRaw = (0, fileParser_service_js_1.normalizeWhitespace)(raw);
    const contentFingerprint = (0, hash_util_js_1.sha256Hex)(normalizedRaw);
    const title = body.title?.trim() || node_path_1.default.basename(sourcePath ?? "inline-manual");
    const dup = await prisma.payerManual.findFirst({
        where: {
            payerId: body.payerId,
            planName: body.planName ?? null,
            title,
            versionLabel: body.versionLabel ?? null,
        },
        select: { id: true },
    });
    if (dup) {
        const reqCount = await prisma.manualRequirement.count({ where: { manualId: dup.id } });
        logger_js_1.logger.info({ manualId: dup.id }, "payer_manual_duplicate_scope");
        return { manualId: dup.id, requirementsCount: reqCount, contentFingerprint };
    }
    let extractionCount = 0;
    const effectiveDate = body.effectiveDate ? new Date(body.effectiveDate) : undefined;
    const parsedStatus = body.persistExtraction ? governance_constants_js_1.MANUAL_PARSED_STATUS.PARSED : governance_constants_js_1.MANUAL_PARSED_STATUS.PENDING;
    const manual = await prisma.payerManual.create({
        data: {
            payerId: body.payerId,
            planName: body.planName ?? null,
            title,
            sourcePath: sourcePath ?? null,
            sourceType: inferSourceType(body.relativePath, body.sourceType),
            versionLabel: body.versionLabel ?? null,
            effectiveDate: effectiveDate ?? null,
            rawText: normalizedRaw,
            contentFingerprint,
            parsedStatus,
        },
    });
    if (body.persistExtraction) {
        const { created } = await (0, manualRequirementExtraction_service_js_1.persistManualRequirementExtractions)(prisma, manual.id, body.payerId, body.planName ?? null, normalizedRaw, { useLlm: body.useLlm ?? false });
        extractionCount = created;
    }
    await (0, payer_intelligence_audit_js_1.writePayerIntelligenceAudit)(prisma, {
        action: "payer_manual_ingested",
        payerId: body.payerId,
        detail: {
            manualId: manual.id,
            sourcePath: sourcePath ?? null,
            contentFingerprint,
            requirementsExtracted: extractionCount,
            persisted: !!body.persistExtraction,
            useLlm: !!body.useLlm,
        },
        actor,
    });
    return {
        manualId: manual.id,
        requirementsCount: extractionCount,
        contentFingerprint,
    };
}
function toPosixRelative(rel) {
    return rel.split(node_path_1.default.sep).filter((p) => p !== "").join("/");
}
function normalizePayerId(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        return "UNKNOWN_PAYER";
    const slug = trimmed
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
    const upper = slug.toUpperCase();
    return upper || "UNKNOWN_PAYER";
}
function inferPayerIdFromRelativePath(relativePosixPath) {
    const segments = relativePosixPath.split("/").filter(Boolean);
    if (segments.length >= 2) {
        return normalizePayerId(segments[0]);
    }
    const stem = node_path_1.default.parse(segments[0] ?? "manual").name;
    return normalizePayerId(stem);
}
async function* walkSupportedFiles(root) {
    const entries = await (0, promises_1.readdir)(root, { withFileTypes: true });
    for (const ent of entries) {
        if (ent.name.startsWith("."))
            continue;
        const full = node_path_1.default.join(root, ent.name);
        if (ent.isDirectory()) {
            yield* walkSupportedFiles(full);
        }
        else if (ent.isFile() && (0, fileParser_service_js_1.manualFileExt)(full)) {
            yield full;
        }
    }
}
function sourceTypeLabelFromExt(ext) {
    if (ext === "pdf")
        return "PDF";
    if (ext === "docx")
        return "DOCX";
    if (ext === "txt")
        return "TXT";
    return null;
}
/**
 * Recursively scan `services/trident/manuals` and ingest local payer manuals.
 * Idempotent: skips ingestion when `contentFingerprint` matches an existing record.
 * Never crashes the whole process if one file fails.
 */
async function scanAndIngestLocalPayerManuals(prisma, opts = {}) {
    const root = node_path_1.default.resolve(opts.root ?? config_js_1.config.governance.tridentManualsRoot);
    const actor = opts.actor ?? "local_payer_manual_ingest";
    const errors = [];
    let filesScanned = 0;
    let filesIngested = 0;
    let duplicatesSkipped = 0;
    let st;
    try {
        st = await (0, promises_1.stat)(root);
    }
    catch (err) {
        throw err instanceof Error ? err : new Error(String(err));
    }
    if (!st.isDirectory()) {
        throw new Error("TRIDENT_MANUALS_ROOT_NOT_A_DIRECTORY");
    }
    for await (const abs of walkSupportedFiles(root)) {
        filesScanned += 1;
        const rel = toPosixRelative(node_path_1.default.relative(root, abs));
        const ext = (0, fileParser_service_js_1.manualFileExt)(abs);
        if (!ext)
            continue;
        try {
            const normalizedText = await (0, fileParser_service_js_1.parseManualFileToText)(abs);
            if (!normalizedText.trim()) {
                throw new Error("EMPTY_PARSED_TEXT");
            }
            const contentFingerprint = (0, hash_util_js_1.sha256Hex)(normalizedText);
            const existing = await prisma.payerManual.findFirst({
                where: { contentFingerprint },
                select: { id: true },
            });
            if (existing) {
                duplicatesSkipped += 1;
                continue;
            }
            const payerId = inferPayerIdFromRelativePath(rel);
            const title = node_path_1.default.basename(rel);
            const sourceType = sourceTypeLabelFromExt(ext);
            await prisma.payerManual.create({
                data: {
                    payerId,
                    planName: null,
                    title,
                    sourcePath: rel,
                    sourceType,
                    rawText: normalizedText,
                    contentFingerprint,
                    parsedStatus: governance_constants_js_1.MANUAL_PARSED_STATUS.PENDING,
                },
            });
            filesIngested += 1;
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            errors.push({ sourcePath: rel, error: message });
            logger_js_1.logger.warn({ rel, err }, "local_payer_manual_ingest_file_failed");
            continue;
        }
    }
    await (0, payer_intelligence_audit_js_1.writePayerIntelligenceAudit)(prisma, {
        action: "local_payer_manual_ingestion_completed",
        payerId: null,
        detail: {
            root,
            filesScanned,
            filesIngested,
            duplicatesSkipped,
            errors: errors.length,
        },
        actor,
    });
    return { root, filesScanned, filesIngested, duplicatesSkipped, errors };
}
class ManualIngestionService {
    db;
    constructor(db = prisma_js_1.prisma) {
        this.db = db;
    }
    async ingestAll(opts = {}) {
        return scanAndIngestLocalPayerManuals(this.db, opts);
    }
}
exports.ManualIngestionService = ManualIngestionService;
exports.manualIngestionService = new ManualIngestionService();
/**
 * For every `PayerManual` with `parsedStatus=PENDING`:
 * - extract deterministic + (optional) LLM candidates
 * - route everything into the review queue (no auto-activation)
 * - persist with excerpt traceability
 * - set `parsedStatus=PARSED`
 */
async function parsePendingPayerManuals(prisma, opts = {}) {
    const actor = opts.actor ?? "auto_parse_pending_manuals";
    const failed = [];
    const pending = await prisma.payerManual.findMany({
        where: { parsedStatus: governance_constants_js_1.MANUAL_PARSED_STATUS.PENDING },
        select: { id: true, payerId: true, planName: true, rawText: true },
    });
    for (const m of pending) {
        try {
            await (0, manualRequirementExtraction_service_js_1.persistManualRequirementExtractions)(prisma, m.id, m.payerId, m.planName, m.rawText, { useLlm: opts.useLlm ?? false, reviewOnly: true });
            await prisma.payerManual.update({
                where: { id: m.id },
                data: { parsedStatus: governance_constants_js_1.MANUAL_PARSED_STATUS.PARSED },
            });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            failed.push({ manualId: m.id, error: message });
        }
    }
    await (0, payer_intelligence_audit_js_1.writePayerIntelligenceAudit)(prisma, {
        action: "auto_parse_pending_manuals_completed",
        payerId: null,
        detail: {
            processed: pending.length - failed.length,
            pendingCount: pending.length,
            failedCount: failed.length,
        },
        actor,
    });
    return { processed: pending.length - failed.length, failed };
}
//# sourceMappingURL=manualIngestion.service.js.map