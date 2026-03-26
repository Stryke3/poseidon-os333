import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { config } from "../../config.js";
import { logger } from "../../lib/logger.js";
import { prisma as appPrisma } from "../../lib/prisma.js";
import { writePayerIntelligenceAudit } from "../../lib/payer-intelligence-audit.js";
import { MANUAL_PARSED_STATUS } from "../governance/governance.constants.js";
import { sha256Hex } from "./hash.util.js";
import type { IngestManualBody } from "./learning.schemas.js";
import { persistManualRequirementExtractions } from "./manualRequirementExtraction.service.js";
import {
  manualFileExt,
  parseManualFileToText,
  normalizeWhitespace,
} from "./fileParser.service.js";

async function readManualFile(relativePath: string): Promise<string> {
  const abs = path.resolve(config.governance.tridentManualsRoot, relativePath);
  const root = path.resolve(config.governance.tridentManualsRoot);
  if (!abs.startsWith(root)) {
    throw new Error("MANUAL_PATH_ESCAPE");
  }
  return readFile(abs, "utf8");
}

function inferSourceType(relativePath: string | undefined, bodyType?: string): string | null {
  if (bodyType) return bodyType;
  if (!relativePath) return null;
  const lower = relativePath.toLowerCase();
  if (lower.endsWith(".pdf")) return "PDF";
  if (lower.endsWith(".docx")) return "DOCX";
  if (lower.endsWith(".txt")) return "TXT";
  return null;
}

export async function ingestPayerManual(
  prisma: PrismaClient,
  body: IngestManualBody,
  actor: string,
): Promise<{ manualId: string; requirementsCount: number; contentFingerprint: string }> {
  let raw: string;
  let sourcePath: string | undefined;

  if (body.relativePath) {
    raw = await readManualFile(body.relativePath);
    sourcePath = body.relativePath.replace(/\\/g, "/");
  } else if (body.rawText) {
    raw = body.rawText;
    sourcePath = undefined;
  } else {
    throw new Error("MANUAL_SOURCE_REQUIRED");
  }

  // Ingest + extraction downstream rely on stable whitespace (and excerpt traceability).
  const normalizedRaw = normalizeWhitespace(raw);
  const contentFingerprint = sha256Hex(normalizedRaw);
  const title = body.title?.trim() || path.basename(sourcePath ?? "inline-manual");

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
    logger.info({ manualId: dup.id }, "payer_manual_duplicate_scope");
    return { manualId: dup.id, requirementsCount: reqCount, contentFingerprint };
  }

  let extractionCount = 0;

  const effectiveDate = body.effectiveDate ? new Date(body.effectiveDate) : undefined;
  const parsedStatus = body.persistExtraction ? MANUAL_PARSED_STATUS.PARSED : MANUAL_PARSED_STATUS.PENDING;

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
    const { created } = await persistManualRequirementExtractions(
      prisma,
      manual.id,
      body.payerId,
      body.planName ?? null,
      normalizedRaw,
      { useLlm: body.useLlm ?? false },
    );
    extractionCount = created;
  }

  await writePayerIntelligenceAudit(prisma, {
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

export type LocalPayerManualIngestionResult = {
  root: string;
  filesScanned: number;
  filesIngested: number;
  duplicatesSkipped: number;
  errors: { sourcePath: string; error: string }[];
};

function toPosixRelative(rel: string): string {
  return rel.split(path.sep).filter((p) => p !== "").join("/");
}

function normalizePayerId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "UNKNOWN_PAYER";
  const slug = trimmed
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  const upper = slug.toUpperCase();
  return upper || "UNKNOWN_PAYER";
}

function inferPayerIdFromRelativePath(relativePosixPath: string): string {
  const segments = relativePosixPath.split("/").filter(Boolean);
  if (segments.length >= 2) {
    return normalizePayerId(segments[0]!);
  }
  const stem = path.parse(segments[0] ?? "manual").name;
  return normalizePayerId(stem);
}

async function* walkSupportedFiles(root: string): AsyncGenerator<string> {
  const entries = await readdir(root, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name.startsWith(".")) continue;
    const full = path.join(root, ent.name);
    if (ent.isDirectory()) {
      yield* walkSupportedFiles(full);
    } else if (ent.isFile() && manualFileExt(full)) {
      yield full;
    }
  }
}

function sourceTypeLabelFromExt(ext: ReturnType<typeof manualFileExt>): string | null {
  if (ext === "pdf") return "PDF";
  if (ext === "docx") return "DOCX";
  if (ext === "txt") return "TXT";
  return null;
}

/**
 * Recursively scan `services/trident/manuals` and ingest local payer manuals.
 * Idempotent: skips ingestion when `contentFingerprint` matches an existing record.
 * Never crashes the whole process if one file fails.
 */
export async function scanAndIngestLocalPayerManuals(
  prisma: PrismaClient,
  opts: { root?: string; actor?: string } = {},
): Promise<LocalPayerManualIngestionResult> {
  const root = path.resolve(opts.root ?? config.governance.tridentManualsRoot);
  const actor = opts.actor ?? "local_payer_manual_ingest";

  const errors: { sourcePath: string; error: string }[] = [];
  let filesScanned = 0;
  let filesIngested = 0;
  let duplicatesSkipped = 0;

  let st: Awaited<ReturnType<typeof stat>>;
  try {
    st = await stat(root);
  } catch (err: unknown) {
    throw err instanceof Error ? err : new Error(String(err));
  }
  if (!st.isDirectory()) {
    throw new Error("TRIDENT_MANUALS_ROOT_NOT_A_DIRECTORY");
  }

  for await (const abs of walkSupportedFiles(root)) {
    filesScanned += 1;
    const rel = toPosixRelative(path.relative(root, abs));
    const ext = manualFileExt(abs);
    if (!ext) continue;

    try {
      const normalizedText = await parseManualFileToText(abs);
      if (!normalizedText.trim()) {
        throw new Error("EMPTY_PARSED_TEXT");
      }

      const contentFingerprint = sha256Hex(normalizedText);
      const existing = await prisma.payerManual.findFirst({
        where: { contentFingerprint },
        select: { id: true },
      });

      if (existing) {
        duplicatesSkipped += 1;
        continue;
      }

      const payerId = inferPayerIdFromRelativePath(rel);
      const title = path.basename(rel);
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
          parsedStatus: MANUAL_PARSED_STATUS.PENDING,
        },
      });

      filesIngested += 1;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ sourcePath: rel, error: message });
      logger.warn({ rel, err }, "local_payer_manual_ingest_file_failed");
      continue;
    }
  }

  await writePayerIntelligenceAudit(prisma, {
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

export class ManualIngestionService {
  constructor(private readonly db: PrismaClient = appPrisma) {}

  async ingestAll(opts: { root?: string; actor?: string } = {}): Promise<LocalPayerManualIngestionResult> {
    return scanAndIngestLocalPayerManuals(this.db, opts);
  }
}

export const manualIngestionService = new ManualIngestionService();

export type AutoParsePendingManualsResult = {
  processed: number;
  failed: { manualId: string; error: string }[];
};

/**
 * For every `PayerManual` with `parsedStatus=PENDING`:
 * - extract deterministic + (optional) LLM candidates
 * - route everything into the review queue (no auto-activation)
 * - persist with excerpt traceability
 * - set `parsedStatus=PARSED`
 */
export async function parsePendingPayerManuals(
  prisma: PrismaClient,
  opts: { actor?: string; useLlm?: boolean } = {},
): Promise<AutoParsePendingManualsResult> {
  const actor = opts.actor ?? "auto_parse_pending_manuals";
  const failed: { manualId: string; error: string }[] = [];

  const pending = await prisma.payerManual.findMany({
    where: { parsedStatus: MANUAL_PARSED_STATUS.PENDING },
    select: { id: true, payerId: true, planName: true, rawText: true },
  });

  for (const m of pending) {
    try {
      await persistManualRequirementExtractions(
        prisma,
        m.id,
        m.payerId,
        m.planName,
        m.rawText,
        { useLlm: opts.useLlm ?? false, reviewOnly: true },
      );

      await prisma.payerManual.update({
        where: { id: m.id },
        data: { parsedStatus: MANUAL_PARSED_STATUS.PARSED },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      failed.push({ manualId: m.id, error: message });
    }
  }

  await writePayerIntelligenceAudit(prisma, {
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
