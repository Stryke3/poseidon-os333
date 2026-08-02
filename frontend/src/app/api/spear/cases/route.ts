import { NextResponse } from 'next/server';
import { appendWorkflowEvent, createCaseFromIntake, listCases } from '@/lib/poseidon-store';
import { isSpearApiAuthFailure, requireSpearApiAuth } from '@/lib/spear-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;

  const cases = await listCases();
  return NextResponse.json({ ok: true, cases });
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
