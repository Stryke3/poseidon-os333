import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCase } from "@/lib/poseidon-store";
import { stediAdapter } from "@/lib/clearinghouse";
import { getStediConfig } from "@/lib/clearinghouse/stedi/config";
import { mapCaseToClaim } from "@/lib/clearinghouse/stedi/mappers";
import { appendClaim, buildException, appendRevenueException, validateCaseForClaim } from "@/lib/poseidon/revenue-records";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";
import type { Claim } from "@/lib/clearinghouse/types";

export const dynamic = "force-dynamic";

function existingClaim(caseRecord: Record<string, unknown>, control: string) {
  const claims = Array.isArray(caseRecord.claims) ? caseRecord.claims as Array<Record<string, unknown>> : [];
  return claims.find((claim) => claim.patientControlNumber === control);
}

export async function POST(_req: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;
  const { caseId } = await params;
  const caseRecord = await getCase(caseId);
  if (!caseRecord) return NextResponse.json({ ok: false, error: "Case not found" }, { status: 404 });
  const validation = validateCaseForClaim(caseRecord);
  if (!validation.ok) {
    await appendRevenueException(buildException({ caseId: caseRecord.id, category: "DOCUMENTATION", title: "Claim validation failed.", detail: validation.blockers.map((b) => b.message).join(" "), nextAction: "Resolve claim blockers before submission." }));
    return NextResponse.json({ ok: false, validation }, { status: 422 });
  }
  const mapped = mapCaseToClaim(caseRecord);
  if (existingClaim(caseRecord, mapped.patientControlNumber!)) return NextResponse.json({ ok: true, duplicatePrevented: true, claim: existingClaim(caseRecord, mapped.patientControlNumber!) });
  const config = getStediConfig();
  if (!config.configured || !config.claimsEnabled || (config.mode === "production" && !config.liveSubmissionEnabled)) {
    return NextResponse.json({ ok: false, error: "Stedi claims disabled by safety gate", stedi: { configured: config.configured, claimsEnabled: config.claimsEnabled, liveSubmissionEnabled: config.liveSubmissionEnabled, mode: config.mode } }, { status: 503 });
  }
  const result = await stediAdapter.submitProfessionalClaim({ caseRecord, version: 1 });
  const now = new Date().toISOString();
  const claim: Claim = {
    id: `claim_${randomUUID()}`,
    caseId: caseRecord.id,
    orderId: caseRecord.order_id,
    version: 1,
    status: "CLAIM_SUBMITTED",
    payer: caseRecord.payer,
    patientControlNumber: mapped.patientControlNumber!,
    idempotencyKey: String(result.claim.idempotencyKey),
    submittedAmount: Number(mapped.submittedAmount || 0),
    submittedAt: now,
    stediTransactionId: String(result.claim.stediTransactionId || ""),
    serviceLines: mapped.serviceLines || [],
    attachmentIds: [],
    statusHistory: [{ status: "CLAIM_SUBMITTED", at: now }],
    rawResponse: result.rawResponse,
    createdAt: now,
    updatedAt: now,
  };
  await appendClaim(caseRecord, claim, result.transaction);
  return NextResponse.json({ ok: true, claim, transaction: result.transaction });
}
