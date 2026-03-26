import { describe, expect, it, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { scanAndIngestTridentManuals } from "../manualScanIngestion.service.js";

describe("scanAndIngestTridentManuals duplicate prevention", () => {
  it("is idempotent by (sourcePath + contentFingerprint)", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "poseidon-trident-"));
    const manualDir = path.join(tmpRoot, "aetna");
    await fs.mkdir(manualDir, { recursive: true });

    const filePath = path.join(manualDir, "policy.txt");
    await fs.writeFile(filePath, "LMN is required for prior authorization.\n", "utf8");

    const memory: Record<string, any> = {};

    const prisma = {
      payerManual: {
        findFirst: vi.fn(async ({ where }: any) => {
          const sourcePath = where?.sourcePath;
          return sourcePath ? memory[sourcePath] ?? null : null;
        }),
        create: vi.fn(async ({ data }: any) => {
          const record = { id: "manual_created", ...data };
          if (data.sourcePath) memory[data.sourcePath] = { id: record.id, contentFingerprint: data.contentFingerprint };
          return record;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const record = { id: where.id, ...data };
          if (data.sourcePath) memory[data.sourcePath] = { id: record.id, contentFingerprint: data.contentFingerprint };
          return record;
        }),
      },
      payerIntelligenceAuditLog: {
        create: vi.fn(async () => ({ id: "audit_1" })),
      },
    } as any;

    const first = await scanAndIngestTridentManuals(prisma, { root: tmpRoot, actor: "test" });
    expect(first.inserted).toBe(1);
    expect(prisma.payerManual.create).toHaveBeenCalledTimes(1);

    const second = await scanAndIngestTridentManuals(prisma, { root: tmpRoot, actor: "test" });
    expect(second.inserted).toBe(0);
    expect(second.updated).toBe(0);
    expect(prisma.payerManual.create).toHaveBeenCalledTimes(1);
  });
});

