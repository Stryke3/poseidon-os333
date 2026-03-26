import type { Prisma, PrismaClient } from "@prisma/client";
import type { PacketClinicalInput, PriorAuthPacketJson } from "../../types/packet.js";
import { writePayerIntelligenceAudit } from "../../lib/payer-intelligence-audit.js";
import { prisma as appPrisma } from "../../lib/prisma.js";
import { hydratePriorAuthPacketView, parseDocumentRefs } from "../packet/packet-hydrate.js";
import { buildScorePriorAuthBodyFromPacket } from "../packet/prior-auth-score-gate.js";
import { payerBehaviorService } from "../payer-behavior/payerBehavior.service.js";
import { applyPlaybook, executePlaybookOnPacketJson } from "./playbook.executor.js";
import { persistPlaybookAmendedDocument } from "./playbook.document-versioning.js";
import { matchPlaybook, rankMatchingPlaybooks, selectBestPlaybook } from "./playbook.matcher.js";
import {
  createPlaybookBodySchema,
  playbookDocumentRulesJsonSchema,
  playbookEscalationRulesJsonSchema,
  playbookStrategyJsonSchema,
  type CreatePlaybookBody,
} from "./playbook.schemas.js";
import type {
  Playbook,
  PlaybookExecuteInput,
  PlaybookExecuteResult,
  PlaybookMatchContext,
} from "./playbook.types.js";
import type { PayerPlaybook } from "@prisma/client";

export function toPlaybook(row: PayerPlaybook): Playbook {
  const strategyParsed = playbookStrategyJsonSchema.safeParse(row.strategy ?? {});
  const strategy = strategyParsed.success ? strategyParsed.data : {};
  const docParsed = playbookDocumentRulesJsonSchema.safeParse(row.documentRules ?? {});
  const documentRules = docParsed.success ? docParsed.data : {};
  const escParsed = playbookEscalationRulesJsonSchema.safeParse(row.escalationRules ?? {});
  const escalationRules = escParsed.success ? escParsed.data : {};
  return {
    id: row.id,
    payerId: row.payerId,
    planName: row.planName ?? undefined,
    deviceCategory: row.deviceCategory ?? undefined,
    hcpcsCode: row.hcpcsCode ?? undefined,
    diagnosisCode: row.diagnosisCode ?? undefined,
    strategy,
    documentRules,
    escalationRules,
    version: row.version,
  };
}

function matchContextFromClinical(
  casePayerId: string,
  clinical: PacketClinicalInput,
  planName?: string,
): PlaybookMatchContext {
  return {
    payerId: casePayerId,
    planName,
    deviceCategory: clinical.device.category,
    hcpcsCode: clinical.device.hcpcs,
    diagnosisCodes: clinical.diagnosis.map((d) => d.code),
  };
}

export async function applyPlaybookAfterPacketGeneration(
  tx: Prisma.TransactionClient,
  params: {
    packetId: string;
    caseId: string;
    clinical: PacketClinicalInput;
    packetView: PriorAuthPacketJson;
    actor: string;
    planName?: string;
  },
): Promise<PriorAuthPacketJson> {
  const caseRow = await tx.case.findUnique({ where: { id: params.caseId } });
  if (!caseRow) return params.packetView;

  const ctx = matchContextFromClinical(caseRow.payerId, params.clinical, params.planName);
  const rows = await tx.payerPlaybook.findMany({
    where: { payerId: caseRow.payerId, active: true },
  });
  const best = selectBestPlaybook(rows, ctx);
  if (!best) return params.packetView;

  const playbook = toPlaybook(best);
  const exec = executePlaybookOnPacketJson(playbook, params.packetView);

  const execution = await tx.playbookExecution.create({
    data: {
      caseId: params.caseId,
      playbookId: playbook.id,
      version: playbook.version,
      inputSnapshot: {
        matchContext: ctx,
        packetId: params.packetId,
        actor: params.actor,
      } as object,
      outputSnapshot: {
        modifications: exec.modifications,
        modifiedDocumentIds: exec.modifiedDocumentIds,
        payloadPatch: exec.payloadPatch,
        textAmendments: exec.textAmendments,
      } as object,
    },
  });

  for (let i = 0; i < exec.updatedPacket.documents.length; i++) {
    const d = exec.updatedPacket.documents[i]!;
    const id = exec.updatedPacket.documentIds[i];
    if (!id || !exec.modifiedDocumentIds.includes(id)) continue;
    await persistPlaybookAmendedDocument(tx, {
      documentId: id,
      newContent: d.renderedText,
      playbookExecutionId: execution.id,
      playbookId: playbook.id,
      playbookVersion: playbook.version,
      actor: params.actor,
      payerId: caseRow.payerId,
      caseId: params.caseId,
    });
  }

  const packetRow = await tx.priorAuthPacket.findUnique({ where: { id: params.packetId } });
  if (packetRow) {
    const basePayload =
      packetRow.payload && typeof packetRow.payload === "object"
        ? (packetRow.payload as Record<string, unknown>)
        : {};
    await tx.priorAuthPacket.update({
      where: { id: params.packetId },
      data: {
        payload: { ...basePayload, ...exec.payloadPatch } as object,
      },
    });
  }

  await writePayerIntelligenceAudit(tx, {
    action: "playbook_applied_to_packet",
    payerId: caseRow.payerId,
    caseId: params.caseId,
    detail: {
      executionId: execution.id,
      packetId: params.packetId,
      playbookId: playbook.id,
      playbookVersion: playbook.version,
      modifications: exec.modifications,
      textAmendments: exec.textAmendments,
    },
    actor: params.actor,
  });

  return exec.updatedPacket;
}

export class PlaybookService {
  constructor(private readonly db: PrismaClient) {}

  async createPlaybook(body: CreatePlaybookBody, actor: string): Promise<PayerPlaybook> {
    const parsed = createPlaybookBodySchema.parse(body);
    const strategy = playbookStrategyJsonSchema.parse(parsed.strategy ?? {});
    const documentRules = playbookDocumentRulesJsonSchema.parse(parsed.documentRules ?? {});
    const escalationRules = playbookEscalationRulesJsonSchema.parse(parsed.escalationRules ?? {});

    const scopePeers = await this.db.payerPlaybook.findMany({
      where: {
        payerId: parsed.payerId,
        planName: parsed.planName ?? null,
        deviceCategory: parsed.deviceCategory ?? null,
        hcpcsCode: parsed.hcpcsCode ?? null,
        diagnosisCode: parsed.diagnosisCode ?? null,
      },
      select: { version: true },
    });
    const maxExisting = scopePeers.reduce((m, r) => Math.max(m, r.version), 0);
    const resolvedVersion = parsed.version ?? maxExisting + 1;
    if (resolvedVersion <= maxExisting) {
      throw new Error(
        `PLAYBOOK_VERSION_CONFLICT: version must be >= ${maxExisting + 1} for this payer and specificity scope (got ${resolvedVersion}).`,
      );
    }

    const row = await this.db.payerPlaybook.create({
      data: {
        payerId: parsed.payerId,
        planName: parsed.planName ?? null,
        deviceCategory: parsed.deviceCategory ?? null,
        hcpcsCode: parsed.hcpcsCode ?? null,
        diagnosisCode: parsed.diagnosisCode ?? null,
        strategy: strategy as object,
        documentRules: documentRules as object,
        escalationRules: escalationRules as object,
        version: resolvedVersion,
        active: parsed.active ?? true,
      },
    });

    await writePayerIntelligenceAudit(this.db, {
      action: "playbook_created",
      payerId: row.payerId,
      detail: { playbookId: row.id, version: row.version },
      actor,
    });

    return row;
  }

  async listByPayerId(payerId: string, opts?: { includeInactive?: boolean }) {
    return this.db.payerPlaybook.findMany({
      where: {
        payerId,
        ...(opts?.includeInactive ? {} : { active: true }),
      },
      orderBy: [{ version: "desc" }, { id: "asc" }],
    });
  }

  /**
   * Match an active playbook by payer + specificity fields, apply document rules on an
   * attachment-shaped packet, and record a `PlaybookExecution`. For full prior-auth packets
   * use {@link executeOnPacket} (hydrated view + DB document updates).
   */
  async execute(input: PlaybookExecuteInput): Promise<PlaybookExecuteResult> {
    const playbooks = await this.db.payerPlaybook.findMany({
      where: { payerId: input.payerId, active: true },
    });

    const row = matchPlaybook(playbooks, {
      payerId: input.payerId,
      planName: input.planName,
      deviceCategory: input.deviceCategory,
      hcpcsCode: input.hcpcsCode,
      diagnosisCode: input.diagnosisCode,
    });

    if (!row) {
      const exec = await this.db.playbookExecution.create({
        data: {
          caseId: input.caseId ?? null,
          playbookId: null,
          version: 0,
          inputSnapshot: {
            caseId: input.caseId ?? null,
            payerId: input.payerId,
            planName: input.planName,
            deviceCategory: input.deviceCategory,
            hcpcsCode: input.hcpcsCode,
            diagnosisCode: input.diagnosisCode,
            packet: input.packet,
          } as object,
          outputSnapshot: {
            matched: false,
            modifications: [],
            textAmendments: [],
            updatedPacket: input.packet,
          } as object,
        },
      });

      await writePayerIntelligenceAudit(this.db, {
        action: "playbook_execute_no_match",
        payerId: input.payerId,
        caseId: input.caseId,
        detail: { executionId: exec.id },
        actor: input.actor ?? "system",
      });

      return {
        executionId: exec.id,
        playbookId: null,
        version: null,
        modifications: [],
        textAmendments: [],
        updatedPacket: input.packet,
      };
    }

    const playbook = toPlaybook(row);
    const result = applyPlaybook(input.packet, playbook);

    const exec = await this.db.playbookExecution.create({
      data: {
        caseId: input.caseId ?? null,
        playbookId: row.id,
        version: row.version,
        inputSnapshot: {
          caseId: input.caseId ?? null,
          payerId: input.payerId,
          planName: input.planName,
          deviceCategory: input.deviceCategory,
          hcpcsCode: input.hcpcsCode,
          diagnosisCode: input.diagnosisCode,
          packet: input.packet,
        } as object,
        outputSnapshot: {
          playbookId: result.playbookId,
          version: result.version,
          modifications: result.modifications,
          textAmendments: result.textAmendments,
          updatedPacket: result.updatedPacket,
        } as object,
      },
    });

    await writePayerIntelligenceAudit(this.db, {
      action: "playbook_execute_attachment_packet",
      payerId: input.payerId,
      caseId: input.caseId,
      detail: {
        executionId: exec.id,
        playbookId: playbook.id,
        playbookVersion: playbook.version,
        modifications: result.modifications,
        textAmendments: result.textAmendments,
      },
      actor: input.actor ?? "system",
    });

    return {
      executionId: exec.id,
      playbookId: result.playbookId,
      version: result.version,
      modifications: result.modifications,
      textAmendments: result.textAmendments,
      updatedPacket: result.updatedPacket,
    };
  }

  async matchPlaybooks(ctx: PlaybookMatchContext) {
    const rows = await this.db.payerPlaybook.findMany({
      where: { payerId: ctx.payerId, active: true },
    });
    const ranked = rankMatchingPlaybooks(rows, ctx);
    return {
      context: ctx,
      ranked: ranked.map((r) => ({
        id: r.id,
        version: r.version,
        specificityFields: {
          planName: !!r.planName?.trim(),
          deviceCategory: !!r.deviceCategory?.trim(),
          hcpcsCode: !!r.hcpcsCode?.trim(),
          diagnosisCode: !!r.diagnosisCode?.trim(),
        },
      })),
      best: ranked[0]
        ? { id: ranked[0].id, version: ranked[0].version }
        : null,
    };
  }

  async executeOnPacket(params: {
    packetId: string;
    playbookId?: string;
    actor: string;
    runPayerScore?: boolean;
  }) {
    const packet = await this.db.priorAuthPacket.findUnique({
      where: { id: params.packetId },
    });
    if (!packet) throw new Error("PACKET_NOT_FOUND");

    const caseRow = await this.db.case.findUnique({ where: { id: packet.caseId } });
    if (!caseRow) throw new Error("CASE_NOT_FOUND");

    const ids = parseDocumentRefs(packet.documents);
    const docRows =
      ids.length > 0
        ? await this.db.priorAuthDocument.findMany({ where: { id: { in: ids } } })
        : [];

    const packetView = hydratePriorAuthPacketView({
      id: packet.id,
      caseId: packet.caseId,
      status: packet.status,
      documentsJson: packet.documents,
      rows: docRows,
      payloadJson: packet.payload,
      updatedAt: packet.updatedAt,
    });

    const body = await buildScorePriorAuthBodyFromPacket(this.db, params.packetId);
    const ctx: PlaybookMatchContext = {
      payerId: caseRow.payerId,
      planName: body.planName,
      deviceCategory: body.deviceCategory,
      hcpcsCode: body.hcpcsCode,
      diagnosisCodes:
        body.diagnosisCodes?.length ? body.diagnosisCodes : body.diagnosisCode
          ? [body.diagnosisCode]
          : [],
    };

    let playbookRow: PayerPlaybook | null = null;
    if (params.playbookId) {
      playbookRow = await this.db.payerPlaybook.findFirst({
        where: { id: params.playbookId, payerId: caseRow.payerId, active: true },
      });
      if (!playbookRow) throw new Error("PLAYBOOK_NOT_FOUND");
    } else {
      const candidates = await this.db.payerPlaybook.findMany({
        where: { payerId: caseRow.payerId, active: true },
      });
      playbookRow = selectBestPlaybook(candidates, ctx);
      if (!playbookRow) throw new Error("NO_PLAYBOOK_MATCH");
    }

    const playbook = toPlaybook(playbookRow);
    const exec = executePlaybookOnPacketJson(playbook, packetView);

    let payerScoreSnapshotId: string | null = null;
    if (params.runPayerScore) {
      const scoreBody = await buildScorePriorAuthBodyFromPacket(this.db, params.packetId);
      const { snapshot } = await payerBehaviorService.scorePriorAuth(scoreBody, params.actor);
      payerScoreSnapshotId = snapshot.id;
    }

    const execution = await this.db.playbookExecution.create({
      data: {
        caseId: packet.caseId,
        playbookId: playbook.id,
        version: playbook.version,
        inputSnapshot: {
          matchContext: ctx,
          packetId: params.packetId,
          actor: params.actor,
        } as object,
        outputSnapshot: {
          modifications: exec.modifications,
          modifiedDocumentIds: exec.modifiedDocumentIds,
          payloadPatch: exec.payloadPatch,
          textAmendments: exec.textAmendments,
          payerScoreSnapshotId,
        } as object,
      },
    });

    for (let i = 0; i < exec.updatedPacket.documents.length; i++) {
      const d = exec.updatedPacket.documents[i]!;
      const id = exec.updatedPacket.documentIds[i];
      if (!id || !exec.modifiedDocumentIds.includes(id)) continue;
      await persistPlaybookAmendedDocument(this.db, {
        documentId: id,
        newContent: d.renderedText,
        playbookExecutionId: execution.id,
        playbookId: playbook.id,
        playbookVersion: playbook.version,
        actor: params.actor,
        payerId: caseRow.payerId,
        caseId: packet.caseId,
      });
    }

    const basePayload =
      packet.payload && typeof packet.payload === "object"
        ? (packet.payload as Record<string, unknown>)
        : {};
    await this.db.priorAuthPacket.update({
      where: { id: params.packetId },
      data: {
        payload: { ...basePayload, ...exec.payloadPatch } as object,
      },
    });

    await writePayerIntelligenceAudit(this.db, {
      action: "playbook_executed",
      payerId: caseRow.payerId,
      caseId: packet.caseId,
      snapshotId: payerScoreSnapshotId,
      detail: {
        executionId: execution.id,
        playbookId: playbook.id,
        runPayerScore: !!params.runPayerScore,
        modifications: exec.modifications,
        textAmendments: exec.textAmendments,
      },
      actor: params.actor,
    });

    const refreshed = await this.db.priorAuthPacket.findUnique({
      where: { id: params.packetId },
    });
    const refreshedIds = refreshed ? parseDocumentRefs(refreshed.documents) : [];
    const refreshedRows =
      refreshedIds.length > 0
        ? await this.db.priorAuthDocument.findMany({ where: { id: { in: refreshedIds } } })
        : [];
    const updatedPacket = refreshed
      ? hydratePriorAuthPacketView({
          id: refreshed.id,
          caseId: refreshed.caseId,
          status: refreshed.status,
          documentsJson: refreshed.documents,
          rows: refreshedRows,
          payloadJson: refreshed.payload,
          updatedAt: refreshed.updatedAt,
        })
      : exec.updatedPacket;

    return {
      success: true as const,
      executionId: execution.id,
      playbookId: playbook.id,
      version: playbook.version,
      modifications: exec.modifications,
      textAmendments: exec.textAmendments,
      updatedPacket,
      payerScoreSnapshotId,
    };
  }
}

export const playbookService = new PlaybookService(appPrisma);

export function createPlaybookService(db: PrismaClient): PlaybookService {
  return new PlaybookService(db);
}
