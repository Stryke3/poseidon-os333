import { NextResponse } from 'next/server';
const TRIDENT = process.env.NEXT_PUBLIC_TRIDENT_API_URL || 'https://trident-production-e1ed.up.railway.app';
export async function GET() {
  try {
    const [status, payers] = await Promise.all([
      fetch(`${TRIDENT}/api/v1/trident/learning-status`).then(r => r.json()),
      fetch(`${TRIDENT}/payers`).then(r => r.json()),
    ]);
    return NextResponse.json({ status, payers });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
