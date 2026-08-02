import { NextResponse } from "next/server";
import { getStoreBackendStatus, getStoreSnapshot } from "@/lib/poseidon-store";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;

  const started = Date.now();
  const snapshot = await getStoreSnapshot();
  return NextResponse.json({
    ok: true,
    ...getStoreBackendStatus(),
    counts: {
      cases: snapshot.cases.length,
      events: snapshot.events.length,
      trident_reviews: snapshot.trident_reviews.length,
    },
    read_ms: Date.now() - started,
  });
}
