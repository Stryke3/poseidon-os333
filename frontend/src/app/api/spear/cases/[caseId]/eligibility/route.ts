import { NextResponse } from "next/server";
import { getCase } from "@/lib/poseidon-store";
import { stediAdapter } from "@/lib/clearinghouse";
import { getStediConfig } from "@/lib/clearinghouse/stedi/config";
import { mapCaseToEligibilityRequest } from "@/lib/clearinghouse/stedi/mappers";
import { appendEligibility } from "@/lib/poseidon/revenue-records";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";

export const dynamic = "force-dynamic";

function fresh(caseRecord: Record<string, unknown>, hours: number) {
  const checks = Array.isArray(caseRecord.eligibility_checks) ? caseRecord.eligibility_checks as Array<Record<string, unknown>> : [];
  const latest = checks[0];
  if (!latest?.checkedAt) return null;
  const age = Date.now() - new Date(String(latest.checkedAt)).getTime();
  return age >= 0 && age < hours * 3600_000 ? latest : null;
}

export async function POST(_req: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;
  const { caseId } = await params;
  const caseRecord = await getCase(caseId);
  if (!caseRecord) return NextResponse.json({ ok: false, error: "Case not found" }, { status: 404 });
  const config = getStediConfig();
  const cached = fresh(caseRecord, config.eligibilityFreshnessHours);
  if (cached) return NextResponse.json({ ok: true, cached: true, eligibility: cached });
  if (!config.configured || !config.eligibilityEnabled) return NextResponse.json({ ok: false, error: "Stedi not configured or eligibility disabled", stedi: { configured: config.configured, enabled: config.eligibilityEnabled } }, { status: 503 });
  const result = await stediAdapter.checkEligibility({ caseRecord, request: mapCaseToEligibilityRequest(caseRecord) });
  await appendEligibility(caseRecord, result.eligibility, result.transaction);
  return NextResponse.json({ ok: true, cached: false, eligibility: result.eligibility, transaction: result.transaction });
}
