import { NextResponse } from "next/server";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";
import { manualAdvanceCase } from "@/lib/spear-manual-advance";

export const dynamic = "force-dynamic";

function ip(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
}

export async function POST(req: Request) {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;

  const payload = await req.json().catch(() => ({}));
  const caseIds = Array.isArray(payload.case_ids) ? payload.case_ids.map(String).filter(Boolean) : [];
  if (!caseIds.length) {
    return NextResponse.json({ ok: false, error: "case_ids is required.", results: [] }, { status: 400 });
  }

  const results = [];
  for (const caseId of caseIds) {
    const result = await manualAdvanceCase(caseId, {
      ...payload,
      attested_by: payload.attested_by || auth.user?.email || auth.user?.id,
      ip_address: ip(req),
    });
    results.push({ case_id: caseId, ...result });
  }

  return NextResponse.json({
    ok: results.every((result) => result.ok),
    results,
    advanced: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
  }, { status: results.some((result) => !result.ok) ? 207 : 200 });
}
