import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getStediConfig } from "@/lib/clearinghouse/stedi/config";
import { stediAdapter } from "@/lib/clearinghouse";
import { appendRemittance, audit } from "@/lib/poseidon/revenue-records";

export const dynamic = "force-dynamic";

const processed = new Set<string>();

function verify(raw: string, signature: string | null) {
  const secret = getStediConfig().webhookSecret;
  if (!secret) return false;
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(signature.replace(/^sha256=/, ""), "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verify(raw, req.headers.get("stedi-signature") || req.headers.get("x-stedi-signature"))) return NextResponse.json({ ok: false, error: "Invalid webhook authentication" }, { status: 403 });
  const event = JSON.parse(raw || "{}") as Record<string, unknown>;
  const eventId = String(event.id || event.eventId || event.transactionId || "");
  if (!eventId) return NextResponse.json({ ok: false, error: "Webhook event id missing" }, { status: 400 });
  if (processed.has(eventId)) return NextResponse.json({ ok: true, duplicate: true });
  processed.add(eventId);
  const transactionId = String(event.transactionId || event.data && typeof event.data === "object" ? (event.data as Record<string, unknown>).transactionId || "" : "");
  const type = String(event.transactionType || event.type || "").toLowerCase();
  if (transactionId && type.includes("835")) {
    const result = await stediAdapter.get835ERA(transactionId);
    await appendRemittance(result.remittance, result.transaction);
  } else if (transactionId && type.includes("277")) {
    await stediAdapter.get277CA(transactionId);
  }
  await audit(String(event.caseId || "stedi_webhook"), "STEDI_WEBHOOK_RECEIVED", { event_id: eventId, transaction_id: transactionId, transaction_type: type });
  return NextResponse.json({ ok: true, eventId });
}
