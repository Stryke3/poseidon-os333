import { NextResponse } from "next/server";
import { stediAdapter } from "@/lib/clearinghouse";
import { getStediConfig } from "@/lib/clearinghouse/stedi/config";
import { getClaim, audit } from "@/lib/poseidon/revenue-records";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ claimId: string }> }) {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;
  const { claimId } = await params;
  const claim = await getClaim(claimId);
  if (!claim) return NextResponse.json({ ok: false, error: "Claim not found" }, { status: 404 });
  const config = getStediConfig();
  if (!config.configured || !config.statusEnabled) return NextResponse.json({ ok: false, error: "Stedi claim status disabled or not configured" }, { status: 503 });
  const result = await stediAdapter.checkClaimStatus({ caseId: claim.caseId, claimId: claim.id, patientControlNumber: claim.patientControlNumber });
  await audit(claim.caseId, "STEDI_STATUS_CHECKED", { claim_id: claim.id, normalized_status: result.normalizedStatus, transaction_id: result.transaction.id });
  return NextResponse.json({ ok: true, status: result.normalizedStatus, transaction: result.transaction, rawResponse: result.rawResponse });
}
