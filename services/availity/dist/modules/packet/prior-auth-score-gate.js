"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyPriorAuthScoreGate = classifyPriorAuthScoreGate;
exports.payerScoreSnapshotToResult = payerScoreSnapshotToResult;
exports.buildScorePriorAuthBodyFromPacket = buildScorePriorAuthBodyFromPacket;
exports.scorePacketForPriorAuthGate = scorePacketForPriorAuthGate;
exports.scorePriorAuthSubmissionContext = scorePriorAuthSubmissionContext;
const packet_hydrate_js_1 = require("./packet-hydrate.js");
const payerBehavior_rules_js_1 = require("../payer-behavior/payerBehavior.rules.js");
function classifyPriorAuthScoreGate(snapshotId, score) {
    if (score.workflow.blockSubmission) {
        return { kind: "BLOCKED", snapshotId, score };
    }
    if (score.workflow.requiresManualReview) {
        return { kind: "NEEDS_REVIEW", snapshotId, score };
    }
    return { kind: "ALLOW_SUBMIT", snapshotId, score };
}
/** Reconstruct API score shape + workflow from a persisted snapshot row. */
function payerScoreSnapshotToResult(row) {
    const missingRequirements = Array.isArray(row.missingRequirements)
        ? row.missingRequirements
        : [];
    const predictedDenialReasons = Array.isArray(row.predictedDenialReasons)
        ? row.predictedDenialReasons
        : [];
    const explanation = Array.isArray(row.explanation)
        ? row.explanation
        : [];
    const riskLevel = row.riskLevel;
    const workflow = (0, payerBehavior_rules_js_1.computePayerScoreWorkflow)({
        missingRequirements,
        riskLevel,
        recommendedAction: row.recommendedAction,
    });
    return {
        approvalProbability: row.approvalProbability,
        riskLevel,
        predictedDenialReasons,
        missingRequirements,
        recommendedAction: row.recommendedAction,
        explanation,
        workflow,
    };
}
function extractScoreFieldsFromDocumentsAndPayload(packet, caseRow, documents) {
    for (const doc of documents) {
        const raw = doc.inputSnapshot;
        if (raw && typeof raw === "object" && raw !== null && "clinical" in raw) {
            const snap = raw;
            const clinical = snap.clinical;
            const snapCase = snap.case;
            if (clinical?.diagnosis?.length && clinical.device) {
                return {
                    caseId: caseRow.id,
                    payerId: snapCase?.payerId ?? caseRow.payerId,
                    deviceCategory: clinical.device.category,
                    hcpcsCode: clinical.device.hcpcs,
                    diagnosisCode: clinical.diagnosis[0]?.code,
                    diagnosisCodes: clinical.diagnosis.map((d) => d.code),
                    physicianName: clinical.physician?.name,
                };
            }
        }
    }
    const payload = packet.payload;
    const physician = payload.physician;
    const device = payload.device;
    const deviceCategory = typeof device === "string" && device.trim()
        ? device.trim()
        : typeof device === "object" && device !== null && "category" in device
            ? String(device.category ?? "").trim() || undefined
            : undefined;
    const hcpcsFromNested = typeof device === "object" && device !== null && "hcpcs" in device
        ? device.hcpcs?.trim() || undefined
        : undefined;
    const hcpcsTop = typeof payload.hcpcs === "string" ? payload.hcpcs.trim() || undefined : undefined;
    let diagnosisCode;
    if (typeof payload.diagnosis === "string") {
        diagnosisCode = payload.diagnosis.trim() || undefined;
    }
    else if (payload.diagnosis &&
        typeof payload.diagnosis === "object" &&
        "code" in payload.diagnosis) {
        diagnosisCode =
            String(payload.diagnosis.code ?? "").trim() || undefined;
    }
    return {
        caseId: caseRow.id,
        payerId: caseRow.payerId,
        deviceCategory,
        hcpcsCode: hcpcsTop ?? hcpcsFromNested,
        diagnosisCode,
        physicianName: physician?.name,
    };
}
async function buildScorePriorAuthBodyFromPacket(prisma, packetId) {
    const packet = await prisma.priorAuthPacket.findUnique({
        where: { id: packetId },
    });
    if (!packet) {
        throw new Error("PACKET_NOT_FOUND");
    }
    const caseRow = await prisma.case.findUnique({ where: { id: packet.caseId } });
    if (!caseRow) {
        throw new Error("CASE_NOT_FOUND");
    }
    const ids = (0, packet_hydrate_js_1.parseDocumentRefs)(packet.documents);
    const documents = ids.length > 0
        ? await prisma.priorAuthDocument.findMany({ where: { id: { in: ids } } })
        : [];
    const base = extractScoreFieldsFromDocumentsAndPayload(packet, caseRow, documents);
    return {
        ...base,
        packetId: packet.id,
    };
}
/**
 * Runs payer behavior scoring for a packet, persists `payerScoreSnapshotId` on the packet, and
 * returns the gate outcome (block / manual review / allow Availity submit).
 */
async function scorePacketForPriorAuthGate(prisma, payerBehavior, packetId, actor) {
    const body = await buildScorePriorAuthBodyFromPacket(prisma, packetId);
    const { snapshot, score } = await payerBehavior.scorePriorAuth(body, actor);
    await prisma.priorAuthPacket.update({
        where: { id: packetId },
        data: { payerScoreSnapshotId: snapshot.id },
    });
    return classifyPriorAuthScoreGate(snapshot.id, score);
}
async function scorePriorAuthSubmissionContext(prisma, payerBehavior, opts, actor) {
    let pid = opts.packetId;
    if (!pid && opts.caseId) {
        const latest = await prisma.priorAuthPacket.findFirst({
            where: { caseId: opts.caseId },
            orderBy: { updatedAt: "desc" },
        });
        pid = latest?.id;
    }
    if (pid) {
        const outcome = await scorePacketForPriorAuthGate(prisma, payerBehavior, pid, actor);
        return { outcome, resolvedPacketId: pid };
    }
    if (opts.caseId) {
        const c = await prisma.case.findUnique({ where: { id: opts.caseId } });
        if (!c) {
            throw new Error("CASE_NOT_FOUND");
        }
        const { snapshot, score } = await payerBehavior.scorePriorAuth({
            caseId: c.id,
            payerId: c.payerId,
            hasLmn: false,
            hasSwo: false,
            hasClinicals: false,
        }, actor);
        return {
            outcome: classifyPriorAuthScoreGate(snapshot.id, score),
            resolvedPacketId: null,
        };
    }
    throw new Error("NO_SCORING_CONTEXT");
}
//# sourceMappingURL=prior-auth-score-gate.js.map