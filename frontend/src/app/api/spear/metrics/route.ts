import { NextResponse } from 'next/server';
import { getMetrics } from '@/lib/poseidon-store';
import { isSpearApiAuthFailure, requireSpearApiAuth } from '@/lib/spear-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;

  const metrics = await getMetrics();
  return NextResponse.json({
    ok: true,
    metrics,
    openCases: metrics.open_cases,
    needsAction: metrics.needs_action,
    awaitingProvider: metrics.awaiting_provider,
    missingDocs: metrics.missing_docs,
    tridentReview: metrics.trident_review,
    readyToFulfill: metrics.ready_to_fulfill,
    podNeeded: metrics.pod_needed,
    revenueSupport: metrics.revenue_support,
    tebraStaged: metrics.tebra_staged,
    tebraReady: metrics.tebra_ready,
    readyToBill: metrics.ready_to_bill,
    blockedCases: metrics.blocked_cases,
    highRiskFlags: metrics.high_risk_flags,
    packetsAwaitingCertification: metrics.packets_awaiting_certification,
    submissionsAwaitingConfirmation: metrics.submissions_awaiting_confirmation,
    payerDispositionPending: metrics.payer_disposition_pending,
    authorized: metrics.authorized,
    denialsAndAppeals: metrics.denials_and_appeals,
  });
}
