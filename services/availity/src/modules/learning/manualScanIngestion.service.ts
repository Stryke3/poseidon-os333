import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { config } from "../../config.js";
import { logger } from "../../lib/logger.js";
import { writePayerIntelligenceAudit } from "../../lib/payer-intelligence-audit.js";
import { MANUAL_PARSED_STATUS } from "../governance/governance.constants.js";
import { checksumManualText } from "../governance/manual-requirement-extractor.js";
import {
  extractManualText,
  isSupportedManualFile,
  manualExtension,
} from "./manualTextExtraction.js";

export type TridentManualScanResult = {
  root: string;
  scannedFiles: number;
  skippedUnchanged: number;
  inserted: number;
  updated: number;
  failed: { relativePath: string; error: string }[];
};

/** Normalize relative path to POSIX-style for stable `sourcePath` storage. */
export function toPosixRelative(rel: string): string {
  return rel.split(path.sep).filter((p) => p !== "").join("/");
}

/**
 * Payer key from folder layout under the manuals root, or from the filename stem if the file sits at root.
 * Example: `aetna/dme/foo.txt` → `AETNA`; `UnitedHealthcare-guide.pdf` → `UNITEDHEALTHCARE_GUIDE`
 */
export function inferPayerKeyFromRelativePath(relativePosixPath: string): string {
  const normalized = relativePosixPath.replace(/^\/+/, "");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length >= 2) {
    return normalizePayerId(segments[0]!);
  }
  const file = segments[0] ?? "manual";
  const stem = path.parse(file).name;
  return normalizePayerId(stem);
}

function normalizePayerId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "UNKNOWN_PAYER";
  const slug = trimmed.replace(/[^a-zA-Z0-9]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  const upper = slug.toUpperCase();
  return upper || "UNKNOWN_PAYER";
}

async function* walkFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name.startsWith(".")) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      yield* walkFiles(full);
    } else if (ent.isFile() && isSupportedManualFile(full)) {
      yield full;
    }
  }
}

function sourceTypeLabel(ext: ReturnType<typeof manualExtension>): string | null {
  if (ext === "pdf") return "PDF";
  if (ext === "docx") return "DOCX";
  if (ext === "txt") return "TXT";
  return null;
}

/**
 * Recursively scans `services/trident/manuals` (or `config.governance.tridentManualsRoot`),
 * extracts text, and upserts `PayerManual` rows. Idempotent: same `sourcePath` + `contentFingerprint` → skip.
 * New or changed files get `parsedStatus` **PENDING** (raw text only; no requirement extraction).
 */
export async function scanAndIngestTridentManuals(
  prisma: PrismaClient,
  opts: { root?: string; actor?: string } = {},
): Promise<TridentManualScanResult> {
  const root = path.resolve(opts.root ?? config.governance.tridentManualsRoot);
  const actor = opts.actor ?? "manual-scan";

  const failed: { relativePath: string; error: string }[] = [];
  let scannedFiles = 0;
  let skippedUnchanged = 0;
  let inserted = 0;
  let updated = 0;

  try {
    const st = await stat(root);
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
  } catch (err) {
    logger.warn({ err, root }, "trident_manuals_root_unreadable");
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
    const rel = path.relative(root, abs);
    const relativePath = toPosixRelative(rel);
    const ext = manualExtension(abs);
    if (!ext) continue;

    try {
      const rawText = (await extractManualText(abs, ext)).trim();
      const contentFingerprint = checksumManualText(rawText);
      const payerId = inferPayerKeyFromRelativePath(relativePath);
      const title = path.basename(relativePath);
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
            parsedStatus: MANUAL_PARSED_STATUS.PENDING,
            planName: null,
            versionLabel: null,
            effectiveDate: null,
          },
        });
        updated += 1;
      } else {
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
            parsedStatus: MANUAL_PARSED_STATUS.PENDING,
          },
        });
        inserted += 1;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      failed.push({ relativePath, error: message });
      logger.warn({ relativePath, err }, "trident_manual_scan_file_failed");
    }
  }

  await writePayerIntelligenceAudit(prisma, {
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
