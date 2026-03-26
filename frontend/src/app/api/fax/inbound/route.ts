import { NextRequest, NextResponse } from "next/server";

const CORE_API_URL = process.env.CORE_API_URL || "http://core:8001";

/**
 * Inbound fax webhook — called by Sinch when a fax is received.
 * No auth token required (webhook), but we validate the source.
 */
export async function POST(req: NextRequest) {
  const SINCH_WEBHOOK_SECRET = process.env.SINCH_WEBHOOK_SECRET;

  // Validate webhook signature if configured
  if (SINCH_WEBHOOK_SECRET) {
    const signature =
      req.headers.get("x-sinch-signature") ||
      req.headers.get("authorization") ||
      "";
    if (!signature.includes(SINCH_WEBHOOK_SECRET)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }
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
  const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
  try {
    await fetch(`${CORE_API_URL}/fax/inbound`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(INTERNAL_API_KEY
          ? { Authorization: `Bearer ${INTERNAL_API_KEY}` }
          : {}),
      },
      body: JSON.stringify(inboundEntry),
    });
  } catch {
    console.error("[fax/inbound] Failed to forward to core");
  }

  // Always return 200 to acknowledge webhook
  return NextResponse.json({ received: true, id: inboundEntry.sinch_fax_id });
}
