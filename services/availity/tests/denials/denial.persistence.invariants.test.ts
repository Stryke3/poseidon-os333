import { describe, expect, it, vi, beforeAll } from "vitest";

const writePayerIntelligenceAudit = vi.fn().mockResolvedValue(undefined);

const prismaMock = {
  denialEvent: {
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  denialClassificationSnapshot: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  priorAuthPacket: {
    findUnique: vi.fn(),
  },
  priorAuthDocument: {
    findMany: vi.fn(),
  },
  appealPacket: {
    create: vi.fn(),
  },
} as any;

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: prismaMock,
}));

vi.mock("../../src/lib/payer-intelligence-audit.js", () => ({
  writePayerIntelligenceAudit,
}));

describe("denial recovery persistence invariants", () => {
  let denialRecoveryService: any;

  beforeAll(async () => {
    ({ denialRecoveryService } = await import("../../src/modules/denials/denial.recovery.service.js"));
  });

  // Ensure call counts don't leak between tests.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("embeds the classificationSnapshotId into the generated appeal draft and persists a new AppealPacket", async () => {
    const denialEventId = "den_1";
    const snapshotId = "snap_1";
    const appealId = "ap_1";

    prismaMock.denialEvent.findUnique.mockResolvedValue({
      id: denialEventId,
      caseId: "case_1",
      payerId: "payer_1",
      denialCode: "D0",
      denialReasonText: "Missing documentation. Additional documentation required.",
      denialCategory: null,
      packetId: "pkt_1",
      playbookId: null,
      playbookVersion: null,
      scoreSnapshotId: null,
    });

    prismaMock.denialClassificationSnapshot.findFirst.mockResolvedValue({
      id: snapshotId,
      denialEventId,
      category: "MISSING_DOCUMENTATION",
      confidence: 0.9,
      recoveryType: "RESUBMIT",
      requiredFixes: ["Add missing documentation"],
      requiredAttachments: ["LMN", "SWO", "CLINICAL_SUMMARY"],
      escalationSteps: ["Review denial reason"],
      explanation: ["deterministic"],
      createdAt: new Date(),
    });

    prismaMock.priorAuthPacket.findUnique.mockResolvedValue({
      id: "pkt_1",
      documents: { documentIds: ["doc_lmn", "doc_swo", "doc_cs"] },
    });

    prismaMock.priorAuthDocument.findMany.mockResolvedValue([
      { id: "doc_lmn", type: "LMN", content: "LMN content excerpt" },
      { id: "doc_swo", type: "SWO", content: "SWO content excerpt" },
      { id: "doc_cs", type: "CLINICAL_SUMMARY", content: "Clinical summary excerpt" },
    ]);

    prismaMock.appealPacket.create.mockImplementation(async (args: any) => {
      return {
        id: appealId,
        denialEventId: args.data.denialEventId,
        status: args.data.status,
      };
    });

    const out = await denialRecoveryService.generateRecoveryPacket({
      denialEventId,
      patientName: "should not appear in letter draft (not used)",
      device: "should not appear in letter draft (not used)",
      physicianName: "should not appear in letter draft (not used)",
      rebuttalFacts: ["should not appear in generator draft"],
    });

    expect(prismaMock.appealPacket.create).toHaveBeenCalledTimes(1);

    const appealCreateArg = prismaMock.appealPacket.create.mock.calls[0]?.[0];
    const payload = appealCreateArg?.data?.payload;

    expect(payload?.classificationSnapshotId).toBe(snapshotId);
    expect(out.appealPacket.id).toBe(appealId);

    // letterText is generated inside appeal generator; assert it was created with snapshot linkage.
    expect(appealCreateArg?.data?.letterText).toContain(`ClassificationSnapshotId: ${snapshotId}`);
  });

  it("creates a new AppealPacket for each generateRecoveryPacket call (preserves draft versions)", async () => {
    prismaMock.denialEvent.findUnique.mockResolvedValue({
      id: "den_2",
      caseId: "case_2",
      payerId: "payer_2",
      denialCode: "D0",
      denialReasonText: "Missing documentation. Additional documentation required.",
      denialCategory: null,
      packetId: "pkt_2",
      playbookId: null,
      playbookVersion: null,
      scoreSnapshotId: null,
    });

    prismaMock.denialClassificationSnapshot.findFirst.mockResolvedValue({
      id: "snap_2",
      denialEventId: "den_2",
      category: "MISSING_DOCUMENTATION",
      confidence: 0.9,
      recoveryType: "RESUBMIT",
      requiredFixes: ["Add missing documentation"],
      requiredAttachments: ["LMN"],
      escalationSteps: [],
      explanation: ["deterministic"],
      createdAt: new Date(),
    });

    prismaMock.priorAuthPacket.findUnique.mockResolvedValue({
      id: "pkt_2",
      documents: { documentIds: ["doc_lmn_2"] },
    });

    prismaMock.priorAuthDocument.findMany.mockResolvedValue([
      { id: "doc_lmn_2", type: "LMN", content: "LMN content excerpt 2" },
    ]);

    prismaMock.appealPacket.create.mockImplementation(async (args: any) => {
      return {
        id: `ap_${Math.random().toString(16).slice(2)}`,
        denialEventId: args.data.denialEventId,
        status: args.data.status,
      };
    });

    await denialRecoveryService.generateRecoveryPacket({ denialEventId: "den_2" });
    await denialRecoveryService.generateRecoveryPacket({ denialEventId: "den_2" });

    expect(prismaMock.appealPacket.create).toHaveBeenCalledTimes(2);
    // Ensure we are not updating an existing packet.
    expect(prismaMock.appealPacket.update).toBeUndefined();
  });

  it("creates and uses a DenialClassificationSnapshot when none exists yet", async () => {
    prismaMock.denialEvent.findUnique.mockResolvedValue({
      id: "den_3",
      caseId: "case_3",
      payerId: "payer_3",
      denialCode: "D0",
      denialReasonText: "Missing documentation. Additional documentation required.",
      denialCategory: null,
      packetId: "pkt_3",
      playbookId: null,
      playbookVersion: null,
      scoreSnapshotId: null,
    });

    prismaMock.denialClassificationSnapshot.findFirst.mockResolvedValue(null);
    prismaMock.denialEvent.update.mockResolvedValue({});

    prismaMock.denialClassificationSnapshot.create.mockImplementation(async (args: any) => {
      return {
        id: "snap_3_new",
        ...args.data,
        createdAt: new Date(),
      };
    });

    prismaMock.priorAuthPacket.findUnique.mockResolvedValue({
      id: "pkt_3",
      documents: { documentIds: ["doc_lmn_3", "doc_swo_3", "doc_cs_3"] },
    });

    prismaMock.priorAuthDocument.findMany.mockResolvedValue([
      { id: "doc_lmn_3", type: "LMN", content: "LMN excerpt 3" },
      { id: "doc_swo_3", type: "SWO", content: "SWO excerpt 3" },
      { id: "doc_cs_3", type: "CLINICAL_SUMMARY", content: "Clinical summary excerpt 3" },
    ]);

    prismaMock.appealPacket.create.mockImplementation(async (args: any) => {
      return {
        id: "ap_3",
        denialEventId: args.data.denialEventId,
        status: args.data.status,
      };
    });

    await denialRecoveryService.generateRecoveryPacket({ denialEventId: "den_3" });

    const appealCreateArg = prismaMock.appealPacket.create.mock.calls[0]?.[0];
    expect(appealCreateArg?.data?.payload?.classificationSnapshotId).toBe("snap_3_new");
    expect(appealCreateArg?.data?.letterText).toContain("ClassificationSnapshotId: snap_3_new");
  });
});

