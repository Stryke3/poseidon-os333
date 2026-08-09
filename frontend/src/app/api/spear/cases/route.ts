import { NextResponse } from 'next/server';
import { appendWorkflowEvent, createCaseFromIntake, listCases } from '@/lib/poseidon-store';
import { isSpearApiAuthFailure, requireSpearApiAuth } from '@/lib/spear-auth';
import { isArchivedCase, isSyntheticCase } from '@/lib/spear-next-action';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const includeSynthetic = searchParams.get("includeSynthetic") === "true";
  const cases = await listCases();
  const visibleCases = includeSynthetic
    ? cases
    : cases.filter((record) => !isArchivedCase(record) && !isSyntheticCase(record));
  return NextResponse.json({ ok: true, cases: visibleCases });
}

export async function POST(req: Request) {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;

  const payload = await req.json().catch(() => ({}));
  const record = await createCaseFromIntake(payload);
  await appendWorkflowEvent(record.id, "case_posted", { source: "api/spear/cases" });

  return NextResponse.json({
    ok: true,
    case: record,
    case_id: record.id,
    order_id: record.order_id,
  }, { status: 201 });
}
