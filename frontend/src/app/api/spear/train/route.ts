import { NextResponse } from 'next/server';
import { saveTrainingEvent, updateTrainingAggregates } from '@/lib/poseidon-store';
import { isSpearApiAuthFailure, requireSpearApiAuth } from '@/lib/spear-auth';

export async function POST(req: Request) {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;

  const payload = await req.json().catch(() => ({}));
  const event = await saveTrainingEvent(payload);
  const aggregate = await updateTrainingAggregates(payload);

  return NextResponse.json({
    ok: true,
    training_event_id: event.id,
    stored: true,
    model_retrained: false,
    aggregate_updated: true,
    aggregate,
  }, { status: 201 });
}
