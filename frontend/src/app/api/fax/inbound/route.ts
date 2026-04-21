import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { correlationHeaders, internalApiKeyHeaders } from "@/lib/proxy-headers";
import { getServiceBaseUrl } from "@/lib/runtime-config";

function secureCompare(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function decodeBasicAuth(header: string): { username: string; password: string } | null {
  const match = header.match(/^Basic\s+(.+)$/i);
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

function parseJsonValue(value: FormDataEntryValue | undefined) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Inbound fax webhook — called by Sinch when a fax is received.
 * No auth token required (webhook), but we validate the source.
 */
export async function POST(req: NextRequest) {
  const SINCH_WEBHOOK_SECRET = process.env.SINCH_WEBHOOK_SECRET?.trim() || "";
  const keyId = process.env.SINCH_KEY_ID?.trim() || "";
  const keySecret = process.env.SINCH_KEY_SECRET?.trim() || "";
  const authorization = req.headers.get("authorization")?.trim() || "";
  const basicAuth = decodeBasicAuth(authorization);
  const signature =
    req.headers.get("x-sinch-signature")?.trim() ||
    authorization.replace(/^Bearer\s+/i, "").trim() ||
    "";
  const isBasicAuthValid = Boolean(
    basicAuth &&
    keyId &&
    keySecret &&
    secureCompare(basicAuth.username, keyId) &&
    secureCompare(basicAuth.password, keySecret),
  );
  const isSecretValid = Boolean(
    SINCH_WEBHOOK_SECRET &&
    signature &&
    secureCompare(signature, SINCH_WEBHOOK_SECRET),
  );
  if (!isBasicAuthValid && !isSecretValid) {
    return NextResponse.json({ error: "Invalid webhook authentication" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    body = await req.json();
  } else if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    body = {
      event: parseJsonValue(formData.get("event")),
      eventTime: parseJsonValue(formData.get("eventTime")),
      fax: parseJsonValue(formData.get("fax")),
      file: formData.get("file"),
    };
  } else {
    body = await req.json().catch(() => ({}));
  }

  const fax = typeof body.fax === "object" && body.fax ? (body.fax as Record<string, unknown>) : {};
  const event = String(body.event || "");

  if (event === "FAX_COMPLETED" && String(fax.direction || "").toUpperCase() === "OUTBOUND") {
    return NextResponse.json({
      received: true,
      ignored: true,
      reason: "Outbound completion callback handled without creating an inbound fax record.",
      id: fax.id || null,
    });
  }

  let parsedIntake: Record<string, unknown> | null = null;
  let documentHash: string | null = null;
  const filePart = body.file;
  if (filePart instanceof Blob) {
    let fileBytes: Buffer | null = null;
    try {
      fileBytes = Buffer.from(await filePart.arrayBuffer());
      documentHash = createHash("sha256").update(fileBytes).digest("hex");
    } catch {
      documentHash = null;
    }
    try {
      const intakeUrl = getServiceBaseUrl("INTAKE_API_URL");
      const parseBody = new FormData();
      const uploadBlob =
        fileBytes != null
          ? new Blob([new Uint8Array(fileBytes)], { type: filePart.type || "application/pdf" })
          : filePart;
      parseBody.append("file", uploadBlob, "inbound-fax.pdf");
      const parsedRes = await fetch(`${intakeUrl}/api/v1/intake/upload`, {
        method: "POST",
        headers: {
          ...internalApiKeyHeaders(),
          ...correlationHeaders(req.headers),
        },
        body: parseBody,
      });
      if (parsedRes.ok) {
        const j = (await parsedRes.json().catch(() => null)) as Record<string, unknown> | null;
        if (j && typeof j === "object" && j.kind === "pdf") {
          const { kind: _kind, ...rest } = j;
          parsedIntake = rest;
        } else {
          parsedIntake = j;
        }
      }
    } catch {
      parsedIntake = null;
    }
  }

  const parsedPatientName =
    typeof parsedIntake?.patient_name === "string" ? parsedIntake.patient_name : "";
  const parsedDob =
    typeof parsedIntake?.date_of_birth === "string" ? parsedIntake.date_of_birth : "";
  const parsedMemberId =
    typeof (parsedIntake?.insurance_info as { member_id?: unknown } | undefined)?.member_id === "string"
      ? String((parsedIntake?.insurance_info as { member_id?: string }).member_id)
      : "";

  const externalFromBody =
    typeof body.externalFaxId === "string" && body.externalFaxId.trim()
      ? body.externalFaxId.trim()
      : null;
  const externalFromFax =
    fax && typeof (fax as Record<string, unknown>).externalId === "string"
      ? String((fax as Record<string, unknown>).externalId).trim() || null
      : null;

  const inboundEntry = {
    direction: "inbound",
    fax_number: String(fax.from || body.from || body.caller_id || "unknown"),
    pages: Number(fax.numberOfPages || body.numberOfPages || body.pages || 0),
    status: String(fax.status || "received"),
    sinch_fax_id: String(fax.id || body.id || body.faxId || "") || null,
    external_fax_id: externalFromBody || externalFromFax,
    document_hash: documentHash,
    received_at: String(fax.completedTime || fax.createTime || body.eventTime || new Date().toISOString()),
    file_url: typeof body.contentUrl === "string" ? body.contentUrl : null,
    patient_name: parsedPatientName || null,
    patient_dob: parsedDob || null,
    patient_mrn: parsedMemberId || null,
    raw_webhook: {
      ...body,
      parsed_intake: parsedIntake,
    },
  };

  // Forward to core for storage & OCR pipeline trigger
  const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY?.trim() || "";
  if (!INTERNAL_API_KEY) {
    return NextResponse.json({ error: "Internal forwarding not configured" }, { status: 503 });
  }
  try {
    const coreApiUrl = getServiceBaseUrl("POSEIDON_API_URL");
    const forwardHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Internal-API-Key": INTERNAL_API_KEY,
    };
    if (inboundEntry.sinch_fax_id) {
      forwardHeaders["X-Idempotency-Key"] = String(inboundEntry.sinch_fax_id);
    }
    const upstream = await fetch(`${coreApiUrl}/fax/inbound`, {
      method: "POST",
      headers: forwardHeaders,
      body: JSON.stringify(inboundEntry),
    });
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      return NextResponse.json({ error: "Upstream intake failed", detail: detail.slice(0, 500) }, { status: 502 });
    }
  } catch {
    return NextResponse.json({ error: "Upstream intake unavailable" }, { status: 502 });
  }

  return NextResponse.json({ received: true, id: inboundEntry.sinch_fax_id });
}
