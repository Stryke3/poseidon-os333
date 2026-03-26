import type { ManualRequirement, PayerRule, PlaybookExecution, PriorAuthDocument, PriorAuthPacket } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { validateRequirements } from "./validator.rules.js";
import type { ValidationInput, ValidationResultType } from "./validator.types.js";
import { writePayerIntelligenceAudit } from "../../lib/payer-intelligence-audit.js";
import { payerRuleMatchesInput } from "../payer-behavior/payerBehavior.rules.js";
import { MANUAL_REQUIREMENT_REVIEW_STATE } from "../governance/governance.constants.js";

export class ValidatorService {
  constructor(private readonly prisma: PrismaClient) {}

  async validate(input: ValidationInput): Promise<{ id: string } & ValidationResultType> {
    const manualRequirements = await this.prisma.manualRequirement.findMany({
      where: { payerId: input.payerId, active: true },
    });

    const payerRules = await this.prisma.payerRule.findMany({
      where: { payerId: input.payerId, active: true },
    });

    const result = validateRequirements(input, manualRequirements, payerRules, null);

    const record = await this.prisma.validationResult.create({
      data: {
        caseId: input.caseId ?? null,
        payerId: input.payerId,
        status: result.status,
        missingRequirements: JSON.parse(JSON.stringify(result.missingRequirements)),
        violations: JSON.parse(JSON.stringify(result.violations)),
        warnings: JSON.parse(JSON.stringify(result.warnings)),
        recommendedActions: JSON.parse(JSON.stringify(result.recommendedActions)),
        explanation: JSON.parse(JSON.stringify(result.explanation)),
      },
    });

    return { id: record.id, ...result };
  }
}

export function createValidatorService(prisma: PrismaClient): ValidatorService {
  return new ValidatorService(prisma);
}

function normalizeCodeList(codes: string[] | null | undefined): string[] {
  const out = (codes ?? []).map((c) => String(c).trim()).filter(Boolean);
  return out;
}

function parseJson(input: unknown): unknown | null {
  if (input == null) return null;
  if (typeof input === "string") {
    try {
      return JSON.parse(input) as unknown;
    } catch {
      return null;
    }
  }
  return input as unknown;
}

function matchesManualRequirementScope(
  mr: ManualRequirement,
  ctx: {
    planName?: string;
    deviceCategory?: string | null;
    hcpcsCode?: string | null;
    diagnosisCodes: string[];
  },
): boolean {
  // ManualRequirement fields behave like scoped dimensions; `null` => wildcard.
  if (mr.planName) {
    if (!ctx.planName) return false;
    if (mr.planName.trim().toLowerCase() !== ctx.planName.trim().toLowerCase()) return false;
  }

  if (mr.deviceCategory) {
    const want = mr.deviceCategory.trim().toLowerCase();
    const got = ctx.deviceCategory?.trim().toLowerCase() ?? "";
    if (!got || (!got.includes(want) && got !== want)) return false;
  }

  if (mr.hcpcsCode) {
    const want = mr.hcpcsCode.trim().toUpperCase();
    const got = ctx.hcpcsCode?.trim().toUpperCase() ?? "";
    if (!got || !(got === want || got.startsWith(want))) return false;
  }

  if (mr.diagnosisCode) {
    const want = mr.diagnosisCode.trim().toUpperCase();
    const got = ctx.diagnosisCodes.map((d) => d.trim().toUpperCase());
    if (!got.length) return false;
    const hit = got.some((d) => d === want || d.startsWith(want));
    if (!hit) return false;
  }

  return true;
}

function extractContextFromPlaybookExecution(
  exec: (PlaybookExecution & { inputSnapshot: unknown }) | null,
): {
  planName?: string;
  deviceCategory?: string | null;
  hcpcsCode?: string | null;
  diagnosisCodes: string[];
} | null {
  if (!exec) return null;
  const snap = exec.inputSnapshot as Record<string, unknown> | null;
  const matchContext = (snap?.matchContext as Record<string, unknown> | undefined) ?? undefined;
  if (matchContext) {
    const diagnosisCodesRaw = matchContext.diagnosisCodes;
    const diagnosisCodes = Array.isArray(diagnosisCodesRaw)
      ? diagnosisCodesRaw.map((x) => String(x)).filter(Boolean)
      : [];

    return {
      planName: typeof matchContext.planName === "string" ? matchContext.planName : undefined,
      deviceCategory:
        typeof matchContext.deviceCategory === "string" ? matchContext.deviceCategory : null,
      hcpcsCode: typeof matchContext.hcpcsCode === "string" ? matchContext.hcpcsCode : null,
      diagnosisCodes: normalizeCodeList(diagnosisCodes),
    };
  }

  // playbookService.execute() shape: { payerId, planName, deviceCategory, hcpcsCode, diagnosisCode, packet }
  const diagnosisCode =
    typeof snap?.diagnosisCode === "string" && snap.diagnosisCode.trim()
      ? snap.diagnosisCode.trim()
      : undefined;

  const diagnosisCodes = diagnosisCode ? [diagnosisCode] : [];

  return {
    planName: typeof snap?.planName === "string" ? snap.planName : undefined,
    deviceCategory: typeof snap?.deviceCategory === "string" ? snap.deviceCategory : null,
    hcpcsCode: typeof snap?.hcpcsCode === "string" ? snap.hcpcsCode : null,
    diagnosisCodes: normalizeCodeList(diagnosisCodes),
  };
}

function extractContextFromDocuments(
  documents: PriorAuthDocument[],
): {
  planName?: string;
  deviceCategory?: string | null;
  hcpcsCode?: string | null;
  diagnosisCodes: string[];
} {
  // Best-effort deterministic extraction from two document generator shapes:
  // 1) packet-generator inputSnapshot: includes clinical + derived
  // 2) prior-auth-packet.service document-generator inputSnapshot: includes diagnosis/device/hcpcs/orderDate
  const docs = documents.slice();
  const lmn = docs.find((d) => d.type === "LMN");
  const swo = docs.find((d) => d.type === "SWO");
  const firstAny = docs[0];

  const fromClinicalShape = (snap: any) => {
    const clinical = snap?.clinical;
    if (!clinical || typeof clinical !== "object") return null;
    const deviceCategory = clinical.device?.category ?? null;
    const hcpcsCode = clinical.device?.hcpcs ?? null;
    const diagnosisCodes = Array.isArray(clinical.diagnosis)
      ? clinical.diagnosis.map((x: any) => String(x?.code ?? "")).filter(Boolean)
      : [];
    return { deviceCategory, hcpcsCode, diagnosisCodes };
  };

  const fromDocumentGenShape = (snap: any) => {
    const deviceCategory = typeof snap.device === "string" ? snap.device : null;
    const hcpcsCode = typeof snap.hcpcs === "string" ? snap.hcpcs : null;
    const diagnosisCodes =
      typeof snap.diagnosis === "string" ? [snap.diagnosis] : [];
    return { deviceCategory, hcpcsCode, diagnosisCodes };
  };

  const candidates = [lmn?.inputSnapshot, swo?.inputSnapshot, firstAny?.inputSnapshot].filter(Boolean) as any[];
  for (const snap of candidates) {
    const clinical = fromClinicalShape(snap);
    if (clinical && clinical.diagnosisCodes.length > 0) {
      return {
        planName: undefined,
        deviceCategory: clinical.deviceCategory ?? null,
        hcpcsCode: clinical.hcpcsCode ?? null,
        diagnosisCodes: normalizeCodeList(clinical.diagnosisCodes),
      };
    }
  }

  for (const snap of candidates) {
    const dg = fromDocumentGenShape(snap);
    if (dg && dg.diagnosisCodes.length > 0) {
      return {
        planName: undefined,
        deviceCategory: dg.deviceCategory ?? null,
        hcpcsCode: dg.hcpcsCode ?? null,
        diagnosisCodes: normalizeCodeList(dg.diagnosisCodes),
      };
    }
  }

  return {
    planName: undefined,
    deviceCategory: null,
    hcpcsCode: null,
    diagnosisCodes: [],
  };
}

async function loadRelevantPlaybookExecution(
  prisma: PrismaClient,
  packet: PriorAuthPacket,
  packetId: string,
): Promise<PlaybookExecution | null> {
  const executions = await prisma.playbookExecution.findMany({
    where: { caseId: packet.caseId },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  for (const e of executions) {
    const snap = e.inputSnapshot as Record<string, unknown> | null;
    if (!snap || typeof snap !== "object") continue;
    if ((snap as any).packetId === packetId) return e;
  }
  return null;
}

async function deriveEvaluationContext(
  prisma: PrismaClient,
  packet: PriorAuthPacket,
  packetId: string,
  documents: PriorAuthDocument[],
  playbookExecutionId?: string | null,
): Promise<{
  payerId: string;
  planName?: string;
  deviceCategory?: string | null;
  hcpcsCode?: string | null;
  diagnosisCodes: string[];
  playbookExecution: PlaybookExecution | null;
}> {
  const caseRow = await prisma.case.findUnique({ where: { id: packet.caseId } });
  if (!caseRow) throw new Error("CASE_NOT_FOUND");

  const playbookExecution = playbookExecutionId
    ? await prisma.playbookExecution.findUnique({ where: { id: playbookExecutionId } })
    : await loadRelevantPlaybookExecution(prisma, packet, packetId);
  const fromPlaybook = extractContextFromPlaybookExecution(
    playbookExecution as (PlaybookExecution & { inputSnapshot: unknown }) | null,
  );

  const fromDocs = fromPlaybook
    ? null
    : extractContextFromDocuments(documents);

  const resolved = fromPlaybook ?? fromDocs ?? {
    planName: undefined,
    deviceCategory: null,
    hcpcsCode: null,
    diagnosisCodes: [],
  };

  return {
    payerId: caseRow.payerId,
    planName: resolved.planName,
    deviceCategory: resolved.deviceCategory,
    hcpcsCode: resolved.hcpcsCode,
    diagnosisCodes: normalizeCodeList(resolved.diagnosisCodes),
    playbookExecution,
  };
}

export async function validatePacketPreSubmit(
  prisma: PrismaClient,
  params: { packetId: string; actor: string; playbookExecutionId?: string | null },
): Promise<
  ValidationResultType & {
    validationResultId: string;
    packetId: string;
    caseId: string;
    payerId: string;
  }
> {
  const { packetId, actor, playbookExecutionId } = params;
  const packet = await prisma.priorAuthPacket.findUnique({
    where: { id: packetId },
  });
  if (!packet) throw new Error("PACKET_NOT_FOUND");

  const caseRow = await prisma.case.findUnique({ where: { id: packet.caseId } });
  if (!caseRow) throw new Error("CASE_NOT_FOUND");

  const docIdsRaw = packet.documents as any;
  const docIds =
    docIdsRaw && typeof docIdsRaw === "object" && Array.isArray(docIdsRaw.documentIds)
      ? (docIdsRaw.documentIds.filter((x: unknown): x is string => typeof x === "string") as string[])
      : [];

  const documents = docIds.length
    ? await prisma.priorAuthDocument.findMany({ where: { id: { in: docIds } } })
    : [];

  const ctx = await deriveEvaluationContext(prisma, packet, packetId, documents, playbookExecutionId);

  const attachments = documents.map((d) => ({ type: String(d.type), content: d.content }));
  const payload = packet.payload && typeof packet.payload === "object" ? (packet.payload as any) : {};

  const input: ValidationInput = {
    caseId: packet.caseId,
    payerId: ctx.payerId,
    planName: ctx.planName,
    deviceCategory: ctx.deviceCategory ?? undefined,
    hcpcsCode: ctx.hcpcsCode ?? undefined,
    diagnosisCode: ctx.diagnosisCodes[0],
    packet: {
      attachments,
      patient: payload.patient,
      physician: payload.physician,
    },
  };

  const manualRequirements = await prisma.manualRequirement.findMany({
    where: { payerId: input.payerId, active: true },
  });
  const scopedManual = manualRequirements
    .filter((mr) => mr.reviewState !== MANUAL_REQUIREMENT_REVIEW_STATE.REJECTED)
    .filter((mr) =>
      matchesManualRequirementScope(mr, {
        planName: input.planName,
        deviceCategory: input.deviceCategory ?? null,
        hcpcsCode: input.hcpcsCode ?? null,
        diagnosisCodes: input.diagnosisCode ? [input.diagnosisCode] : [],
      }),
    );

  const payerRules = await prisma.payerRule.findMany({
    where: { payerId: input.payerId, active: true },
  });

  const hasLmn = attachments.some((a) => a.type === "LMN");
  const hasSwo = attachments.some((a) => a.type === "SWO");
  const hasClinicals = attachments.some((a) => a.type === "CLINICAL_SUMMARY");

  const scopedPayerRules = payerRules.filter((r) =>
    payerRuleMatchesInput(r, {
      payerId: input.payerId,
      planName: input.planName,
      deviceCategory: input.deviceCategory,
      hcpcsCode: input.hcpcsCode,
      diagnosisCodes: input.diagnosisCode ? [input.diagnosisCode] : [],
      hasLmn,
      hasSwo,
      hasClinicals,
    }),
  );

  const playbookResult = ctx.playbookExecution
    ? (ctx.playbookExecution.outputSnapshot as any)
    : null;

  const result = validateRequirements(input, scopedManual, scopedPayerRules, playbookResult);

  // Prisma JSON columns can't reliably persist `undefined` fields; sanitize deterministically.
  const safeMissingRequirements = JSON.parse(JSON.stringify(result.missingRequirements));
  const safeViolations = JSON.parse(JSON.stringify(result.violations));
  const safeWarnings = JSON.parse(JSON.stringify(result.warnings));
  const safeRecommendedActions = JSON.parse(JSON.stringify(result.recommendedActions));
  const safeExplanation = JSON.parse(JSON.stringify(result.explanation));

  const validationRow = await prisma.validationResult.create({
    data: {
      caseId: packet.caseId,
      payerId: ctx.payerId,
      status: result.status,
      missingRequirements: safeMissingRequirements,
      violations: safeViolations,
      warnings: safeWarnings,
      recommendedActions: safeRecommendedActions,
      explanation: safeExplanation,
      // actor + trace details are persisted in `payer_intelligence_audit_logs` for full auditability.
    },
  });

  await writePayerIntelligenceAudit(prisma, {
    action: "pre_submit_requirement_validation",
    payerId: ctx.payerId,
    caseId: packet.caseId,
    snapshotId: packet.payerScoreSnapshotId ?? null,
    detail: {
      validationResultId: validationRow.id,
      packetId: packet.id,
      status: result.status,
      missingRequirements: result.missingRequirements,
      violations: result.violations,
      warnings: result.warnings,
      recommendedActions: result.recommendedActions,
      explanation: result.explanation,
    },
    actor,
  });

  return {
    ...result,
    validationResultId: validationRow.id,
    packetId,
    caseId: packet.caseId,
    payerId: ctx.payerId,
  };
}

