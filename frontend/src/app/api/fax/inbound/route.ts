import { NextRequest, NextResponse } from "next/server";
import { getServiceBaseUrl } from "@/lib/runtime-config";

const CORE_API_URL = getServiceBaseUrl("POSEIDON_API_URL");

function secureCompare(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

/**
 * Inbound fax webhook — called by Sinch when a fax is received.
 * No auth token required (webhook), but we validate the source.
 */
export async function POST(req: NextRequest) {
  const SINCH_WEBHOOK_SECRET = process.env.SINCH_WEBHOOK_SECRET?.trim() || "";
  if (!SINCH_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const signature =
    req.headers.get("x-sinch-signature")?.trim() ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    "";
  if (!signature || !secureCompare(signature, SINCH_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  let body;
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    body = await req.json();
  } else if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    body = Object.fromEntries(formData.entries());
  } else {
    body = await req.json().catch(() => ({}));
  }

  const inboundEntry = {
    direction: "inbound",
    fax_number: body.from || body.caller_id || "unknown",
    pages: body.numberOfPages || body.pages || 0,
    status: "received",
    sinch_fax_id: body.id || body.faxId || null,
    received_at: body.completedTime || body.createTime || new Date().toISOString(),
    file_url: body.contentUrl || body.file_url || null,
    raw_webhook: body,
  };

  // Forward to core for storage & OCR pipeline trigger
  const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY?.trim() || "";
  if (!INTERNAL_API_KEY) {
    return NextResponse.json({ error: "Internal forwarding not configured" }, { status: 503 });
  }
  try {
    const upstream = await fetch(`${CORE_API_URL}/fax/inbound`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-API-Key": INTERNAL_API_KEY,
      },
      body: JSON.stringify(inboundEntry),
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: "Upstream intake failed" }, { status: 502 });
    }
  } catch {
    return NextResponse.json({ error: "Upstream intake unavailable" }, { status: 502 });
  }

  return NextResponse.json({ received: true, id: inboundEntry.sinch_fax_id });
}
