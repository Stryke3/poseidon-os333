import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    openCases: 0,
    missingDocs: 0,
    tridentReview: 0,
    readyToFulfill: 0,
    podNeeded: 0,
    revenueSupport: 0,
    tebraReady: 0,
    highRiskFlags: 0,
  });
}
