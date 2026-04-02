import { NextRequest, NextResponse } from "next/server";
import { getRequiredEnv, getServiceBaseUrl } from "@/lib/runtime-config";
import { getSafeServerSession } from "@/lib/auth";

const SINCH_FAX_BASE = "https://fax.api.sinch.com/v3";
/** Sinch converts server-side; large or exotic files often yield DOCUMENT_CONVERSION_ERROR. */
const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;

const ALLOWED_ATTACHMENT_EXT = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".tif",
  ".tiff",
  ".txt",
  ".docx",
]);

interface FaxPayload {
  recipientFax: string;
  senderFax?: string;
  patientId?: string;
  orderId?: string;
  recipientName?: string;
  recipientFacility?: string;
  senderName?: string;
  senderFacility?: string;
  patientName: string;
  patientDOB?: string;
  patientMRN?: string;
  recordTypes: string[];
  dateRange?: string;
  customStart?: string;
  customEnd?: string;
  urgency: string;
  notes?: string;
  authorizationOnFile?: boolean;
  releaseSignedBy?: string;
  releaseSignerRelationship?: string;
  releaseSignedAt?: string;
  releasePurpose?: string;
  releaseAuthorizedBy?: string;
  releaseAttachmentLabel?: string;
}

function escapeHtml(value: string | undefined): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function extensionLower(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function mimeForFax(ext: string): string {
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".tif":
    case ".tiff":
      return "image/tiff";
    case ".txt":
      return "text/plain";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default:
      return "application/octet-stream";
  }
}

/**
 * Validate attachment bytes before Sinch sees them (avoids opaque DOCUMENT_CONVERSION_ERROR emails).
 * @returns error message, or null if valid (ext is the normalized extension including dot).
 */
function validateFaxAttachment(
  buffer: Buffer,
  filename: string,
): { error: string | null; ext: string } {
  if (!buffer.length) {
    return { error: `Attachment "${filename}" is empty.`, ext: "" };
  }
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    return {
      error: `Attachment "${filename}" exceeds ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB. Compress or split the file.`,
      ext: "",
    };
  }

  const ext = extensionLower(filename);
  if (!ALLOWED_ATTACHMENT_EXT.has(ext)) {
    return {
      error: `Unsupported file type "${ext || "(no extension)"}" on "${filename}". Use PDF, PNG, JPG, TIFF, TXT, or DOCX (not HEIC/WebP).`,
      ext: "",
    };
  }

  const head = buffer.subarray(0, Math.min(16, buffer.length));

  if (ext === ".pdf") {
    if (!head.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      return {
        error: `"${filename}" is not a valid PDF (wrong file header). Re-export or print to PDF.`,
        ext: "",
      };
    }
    const asText = buffer.subarray(0, Math.min(2048, buffer.length)).toString("latin1");
    if (/\/Encrypt\b/.test(asText)) {
      return {
        error: `"${filename}" appears password-protected. Remove encryption and resend.`,
        ext: "",
      };
    }
  }

  if (ext === ".png") {
    if (head[0] !== 0x89 || head[1] !== 0x50 || head[2] !== 0x4e || head[3] !== 0x47) {
      return { error: `"${filename}" is not a valid PNG file.`, ext: "" };
    }
  }

  if (ext === ".jpg" || ext === ".jpeg") {
    if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) {
      return { error: `"${filename}" is not a valid JPEG file.`, ext: "" };
    }
  }

  if (ext === ".tif" || ext === ".tiff") {
    const le = head[0] === 0x49 && head[1] === 0x49 && head[2] === 0x2a && head[3] === 0x00;
    const be = head[0] === 0x4d && head[1] === 0x4d && head[2] === 0x00 && head[3] === 0x2a;
    if (!le && !be) {
      return { error: `"${filename}" is not a valid TIFF file.`, ext: "" };
    }
  }

  if (ext === ".docx") {
    if (head[0] !== 0x50 || head[1] !== 0x4b) {
      return { error: `"${filename}" is not a valid DOCX (expected ZIP container).`, ext: "" };
    }
  }

  if (ext === ".txt") {
    const sample = buffer.subarray(0, Math.min(4096, buffer.length));
    if (sample.includes(0)) {
      return {
        error: `"${filename}" looks binary. Save as plain UTF-8 text or use PDF.`,
        ext: "",
      };
    }
  }

  return { error: null, ext };
}

/** Minimal table-based HTML — Sinch's HTML→fax rasterizer often fails on flex/grid and ::before. */
function buildAuthorizationHtml(payload: FaxPayload): string {
  const signedBy = payload.releaseSignedBy || payload.patientName;
  const relationship = payload.releaseSignerRelationship || "Self";
  const signedAt = payload.releaseSignedAt || new Date().toISOString().slice(0, 10);
  const purpose = payload.releasePurpose || payload.notes || "Continuity of care";
  const authorizedBy = payload.releaseAuthorizedBy || "Patient-authorized release";
  const recordList = payload.recordTypes.length
    ? payload.recordTypes.map((record) => `<li>${escapeHtml(record)}</li>`).join("")
    : "<li>All available medical records reasonably necessary for treatment and care coordination.</li>";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: Arial, Helvetica, sans-serif; margin: 24px; color: #000000; font-size: 12px; line-height: 1.4; }
  h1 { font-size: 16px; margin: 0 0 10px 0; }
  .meta { color: #333333; font-size: 11px; margin-bottom: 14px; }
  table.layout { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  td.box { border: 1px solid #000000; padding: 10px; vertical-align: top; }
  .label { font-size: 9px; color: #333333; }
  .value { font-size: 12px; font-weight: bold; }
  ul { margin: 6px 0 0 20px; padding: 0; }
  .fine-print { font-size: 9px; color: #333333; margin-top: 14px; }
</style></head>
<body>
  <h1>Authorization for Release of Protected Health Information</h1>
  <p class="meta">StrykeFox Medical — fax release documentation (45 CFR 164.508).</p>

  <table class="layout" cellpadding="0" cellspacing="0"><tr>
    <td class="box" width="50%"><span class="label">Patient</span><br/><span class="value">${escapeHtml(payload.patientName)}</span></td>
    <td class="box" width="50%"><span class="label">Date of Birth</span><br/><span class="value">${escapeHtml(payload.patientDOB || "Not provided")}</span></td>
  </tr><tr>
    <td class="box"><span class="label">MRN / Account</span><br/><span class="value">${escapeHtml(payload.patientMRN || "Not provided")}</span></td>
    <td class="box"><span class="label">Recipient</span><br/><span class="value">${escapeHtml(payload.recipientFacility || payload.recipientName || payload.recipientFax)}</span></td>
  </tr></table>

  <table class="layout" cellpadding="0" cellspacing="0"><tr><td class="box">
    <span class="label">Information Authorized for Release</span>
    <ul>${recordList}</ul>
    <p><strong>Date range:</strong> ${escapeHtml(
      payload.dateRange === "Custom Date Range"
        ? `${payload.customStart || "N/A"} to ${payload.customEnd || "N/A"}`
        : payload.dateRange || "All Available Records",
    )}</p>
    <p><strong>Purpose:</strong> ${escapeHtml(purpose)}</p>
    <p><strong>Authorized by:</strong> ${escapeHtml(authorizedBy)}</p>
  </td></tr></table>

  <table class="layout" cellpadding="0" cellspacing="0"><tr>
    <td class="box" width="50%"><span class="label">Signed By</span><br/><span class="value">${escapeHtml(signedBy)}</span></td>
    <td class="box" width="50%"><span class="label">Relationship</span><br/><span class="value">${escapeHtml(relationship)}</span></td>
  </tr><tr>
    <td class="box"><span class="label">Signed Date</span><br/><span class="value">${escapeHtml(signedAt)}</span></td>
    <td class="box"><span class="label">Authorization Confirmed</span><br/><span class="value">${payload.authorizationOnFile ? "Yes" : "No"}</span></td>
  </tr></table>

  <p class="fine-print">
    This authorization may be revoked in writing except to the extent action has already been taken in reliance on it.
    The requesting party certifies that the patient or the patient&apos;s legal representative executed this authorization
    and that only the minimum necessary information for the stated purpose is being disclosed.
  </p>
</body>
</html>`;
}

function buildCoverPageHtml(payload: FaxPayload): string {
  const recordList = payload.recordTypes.length
    ? payload.recordTypes.map((r) => `<li>${escapeHtml(r)}</li>`).join("")
    : "<li>All Available Records</li>";

  const dateInfo =
    payload.dateRange === "Custom Date Range"
      ? `${payload.customStart || "N/A"} to ${payload.customEnd || "N/A"}`
      : payload.dateRange || "All Available Records";

  const urgencyLabel: Record<string, string> = {
    routine: "Routine (5-10 business days)",
    urgent: "URGENT (24-48 hours)",
    stat: "STAT - IMMEDIATE",
  };

  const urgencyClass =
    payload.urgency === "stat"
      ? "urgency-stat"
      : payload.urgency === "urgent"
        ? "urgency-urgent"
        : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: Arial, Helvetica, sans-serif; margin: 24px; color: #000000; font-size: 12px; line-height: 1.35; }
  .header { border-bottom: 2px solid #000000; padding-bottom: 10px; margin-bottom: 16px; }
  .logo { font-size: 18px; font-weight: bold; }
  .subtitle { font-size: 10px; color: #333333; }
  table.layout { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  td.col { border: 1px solid #000000; padding: 10px; width: 50%; vertical-align: top; }
  .section-title { font-size: 10px; font-weight: bold; margin: 0 0 6px 0; text-transform: uppercase; }
  .field { margin-bottom: 5px; }
  .label { font-size: 9px; color: #333333; }
  .value { font-size: 12px; font-weight: bold; }
  .urgency-stat { color: #000000; font-weight: bold; }
  .urgency-urgent { color: #000000; font-weight: bold; }
  ul.records-list { margin: 4px 0 0 18px; padding: 0; }
  .hipaa { margin-top: 16px; padding: 10px; border: 1px solid #000000; font-size: 8px; line-height: 1.4; color: #000000; }
  .hipaa-title { font-weight: bold; font-size: 9px; margin-bottom: 4px; }
  .footer { margin-top: 14px; text-align: center; font-size: 9px; color: #333333; }
</style></head>
<body>
  <div class="header">
    <div class="logo">STRYKEFOX</div>
    <div class="subtitle">MEDICAL RECORDS REQUEST</div>
  </div>

  <table class="layout" cellpadding="0" cellspacing="0"><tr>
    <td class="col">
      <p class="section-title">From</p>
      <div class="field"><span class="label">Name: </span><span class="value">${escapeHtml(payload.senderName || "N/A")}</span></div>
      <div class="field"><span class="label">Facility: </span><span class="value">${escapeHtml(payload.senderFacility || "N/A")}</span></div>
      <div class="field"><span class="label">Fax: </span><span class="value">${escapeHtml(payload.senderFax || "N/A")}</span></div>
    </td>
    <td class="col">
      <p class="section-title">To</p>
      <div class="field"><span class="label">Name: </span><span class="value">${escapeHtml(payload.recipientName || "N/A")}</span></div>
      <div class="field"><span class="label">Facility: </span><span class="value">${escapeHtml(payload.recipientFacility || "N/A")}</span></div>
      <div class="field"><span class="label">Fax: </span><span class="value">${escapeHtml(payload.recipientFax)}</span></div>
    </td>
  </tr></table>

  <p class="section-title">Patient Information</p>
  <div class="field"><span class="label">Patient Name: </span><span class="value">${escapeHtml(payload.patientName)}</span></div>
  <div class="field"><span class="label">Date of Birth: </span><span class="value">${escapeHtml(payload.patientDOB || "N/A")}</span></div>
  <div class="field"><span class="label">MRN / Account #: </span><span class="value">${escapeHtml(payload.patientMRN || "N/A")}</span></div>

  <p class="section-title" style="margin-top:12px">Records Requested</p>
  <ul class="records-list">${recordList}</ul>
  <div class="field" style="margin-top:8px"><span class="label">Date Range: </span><span class="value">${escapeHtml(dateInfo)}</span></div>
  <div class="field"><span class="label">Urgency: </span><span class="value ${urgencyClass}">${escapeHtml(urgencyLabel[payload.urgency] || payload.urgency)}</span></div>
  ${payload.notes ? `<div class="field" style="margin-top:8px"><span class="label">Notes: </span><span class="value">${escapeHtml(payload.notes)}</span></div>` : ""}
  <div class="field" style="margin-top:8px"><span class="label">Release Signed By: </span><span class="value">${escapeHtml(payload.releaseSignedBy || payload.patientName)}</span></div>
  <div class="field"><span class="label">Signed Date: </span><span class="value">${escapeHtml(payload.releaseSignedAt || "Not provided")}</span></div>

  <div class="hipaa">
    <div class="hipaa-title">CONFIDENTIALITY NOTICE</div>
    This facsimile transmission contains confidential information that is legally privileged.
    This information is intended only for the use of the individual or entity named above.
    If you are not the intended recipient, do not disclose, copy, or distribute this transmission.
    Notify the sender immediately if received in error.
  </div>

  <div class="footer">
    ${new Date().getFullYear()} StrykeFox Medical Platform — HIPAA — 45 CFR 164
  </div>
</body>
</html>`;
}

function normalizeFaxNumber(num: string): string {
  const digits = num.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

function tryNormalizeFaxNumber(num: string | undefined): string | null {
  const digits = String(num || "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return normalizeFaxNumber(digits);
}

export async function POST(req: NextRequest) {
  const session = await getSafeServerSession();
  if (!session?.user?.accessToken) {
    return NextResponse.json(
      { error: "Your session expired. Please sign in again and resend the fax." },
      { status: 401 },
    );
  }

  // Sinch credentials
  let SINCH_PROJECT_ID = "";
  let SINCH_KEY_ID = "";
  let SINCH_KEY_SECRET = "";
  let coreApiUrl = "";
  try {
    SINCH_PROJECT_ID = getRequiredEnv("SINCH_PROJECT_ID");
    SINCH_KEY_ID = getRequiredEnv("SINCH_KEY_ID");
    SINCH_KEY_SECRET = getRequiredEnv("SINCH_KEY_SECRET");
    coreApiUrl = getServiceBaseUrl("POSEIDON_API_URL");
  } catch {
    return NextResponse.json(
      { error: "Fax service is not configured for production-safe execution." },
      { status: 503 },
    );
  }

  let payload: FaxPayload;
  let attachmentBuffers: { name: string; buffer: Buffer; type: string }[] = [];

  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const body = await req.formData();
    const jsonStr = body.get("payload") as string;
    if (!jsonStr) {
      return NextResponse.json(
        { error: "Missing payload field" },
        { status: 400 }
      );
    }
    payload = JSON.parse(jsonStr);

    const files = body.getAll("attachments");
    for (const file of files) {
      if (file instanceof Blob) {
        const buf = Buffer.from(await file.arrayBuffer());
        attachmentBuffers.push({
          name: (file as File).name || "attachment",
          buffer: buf,
          type: file.type || "application/octet-stream",
        });
      }
    }
  } else {
    payload = await req.json();
  }

  if (!payload.recipientFax || !payload.patientName) {
    return NextResponse.json(
      { error: "recipientFax and patientName are required" },
      { status: 400 }
    );
  }
  if (!payload.authorizationOnFile) {
    return NextResponse.json(
      { error: "Patient authorization confirmation is required before sending a records fax." },
      { status: 400 }
    );
  }
  if (!payload.releaseSignedBy?.trim() || !payload.releaseSignedAt?.trim()) {
    return NextResponse.json(
      { error: "Patient-executed release name and signature date are required." },
      { status: 400 }
    );
  }

  const checked: { name: string; buffer: Buffer; type: string }[] = [];
  for (const att of attachmentBuffers) {
    const { error, ext } = validateFaxAttachment(att.buffer, att.name);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }
    checked.push({
      name: att.name,
      buffer: att.buffer,
      type: mimeForFax(ext),
    });
  }
  attachmentBuffers = checked;

  const coverHtml = buildCoverPageHtml(payload);
  const authorizationHtml = buildAuthorizationHtml(payload);
  const toNumber = normalizeFaxNumber(payload.recipientFax);

  // Build Sinch Fax API multipart request
  const sinchBody = new FormData();
  sinchBody.append("to", toNumber);

  const fromNumber =
    tryNormalizeFaxNumber(process.env.SINCH_FROM_NUMBER) ||
    tryNormalizeFaxNumber(payload.senderFax);
  if (fromNumber) {
    sinchBody.append("from", fromNumber);
  }

  // Header text appears at the top of each fax page
  sinchBody.append(
    "headerText",
    `StrykeFox Medical | ${payload.urgency === "stat" ? "STAT" : payload.urgency === "urgent" ? "URGENT" : "Routine"} | ${payload.patientName}`
  );

  // Only register a callback if the webhook side is configured to accept it.
  const callbackBase = process.env.NEXTAUTH_URL?.trim().replace(/\/$/, "") || "";
  const hasWebhookConfig = Boolean(
    callbackBase &&
    process.env.SINCH_WEBHOOK_SECRET?.trim() &&
    process.env.INTERNAL_API_KEY?.trim(),
  );
  if (hasWebhookConfig) {
    sinchBody.append("callbackUrl", `${callbackBase}/api/fax/inbound`);
    sinchBody.append("callbackUrlContentType", "application/json");
  }

  // Attach cover page as HTML file
  const coverBlob = new Blob([coverHtml], { type: "text/html" });
  sinchBody.append("file", coverBlob, "cover_page.html");
  const authorizationBlob = new Blob([authorizationHtml], { type: "text/html" });
  sinchBody.append(
    "file",
    authorizationBlob,
    `${(payload.releaseAttachmentLabel || "patient_release_authorization").replace(/[^a-zA-Z0-9._-]+/g, "_")}.html`
  );

  // Attach uploaded files
  for (const att of attachmentBuffers) {
    const blob = new Blob([new Uint8Array(att.buffer)], { type: att.type });
    sinchBody.append("file", blob, att.name);
  }

  // Basic auth: key_id:key_secret
  const basicAuth = Buffer.from(`${SINCH_KEY_ID}:${SINCH_KEY_SECRET}`).toString(
    "base64"
  );

  try {
    const faxRes = await fetch(
      `${SINCH_FAX_BASE}/projects/${SINCH_PROJECT_ID}/faxes`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
        },
        body: sinchBody,
      }
    );

    const faxData = await faxRes.json().catch(() => ({}));

    if (!faxRes.ok) {
      const sinchDetail =
        Array.isArray(faxData?.details) && faxData.details.length
          ? faxData.details
              .flatMap((detail: { message?: string; fieldViolations?: { field?: string; description?: string }[] }) => {
                const violations = Array.isArray(detail?.fieldViolations)
                  ? detail.fieldViolations
                      .map((violation) =>
                        violation?.field && violation?.description
                          ? `${violation.field}: ${violation.description}`
                          : violation?.description || violation?.field || "",
                      )
                      .filter(Boolean)
                  : [];
                if (violations.length) return violations;
                return detail?.message ? [detail.message] : [];
              })
              .join(" | ")
          : typeof faxData?.message === "string"
            ? faxData.message
            : undefined;

      console.error("Sinch fax send failed", {
        status: faxRes.status,
        detail: sinchDetail,
        toNumber,
        fromNumber,
        patientName: payload.patientName,
      });

      return NextResponse.json(
        {
          error: "Fax transmission failed",
          sinchStatus: faxRes.status,
          detail: sinchDetail,
        },
        { status: 502 }
      );
    }

    // Log to database via core service
    const logPayload = {
      direction: "outbound",
      fax_number: toNumber,
      facility: payload.recipientFacility || "",
      patient_name: payload.patientName,
      patient_dob: payload.patientDOB || null,
      patient_mrn: payload.patientMRN || null,
      patient_id: payload.patientId || null,
      order_id: payload.orderId || null,
      record_types: payload.recordTypes,
      urgency: payload.urgency,
      status: "sent",
      pages: 2 + attachmentBuffers.length,
      service: "sinch",
      sinch_fax_id: faxData.id || null,
      sent_by: session.user.email || "unknown",
      release_metadata: {
        authorization_on_file: Boolean(payload.authorizationOnFile),
        signed_by: payload.releaseSignedBy || payload.patientName,
        signer_relationship: payload.releaseSignerRelationship || "Self",
        signed_at: payload.releaseSignedAt || null,
        purpose: payload.releasePurpose || payload.notes || null,
        authorized_by: payload.releaseAuthorizedBy || null,
      },
    };

    const logRes = await fetch(`${coreApiUrl}/fax/log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.user.accessToken}`,
      },
      body: JSON.stringify(logPayload),
      cache: "no-store",
    }).catch(() => null);

    if (!logRes || !logRes.ok) {
      const logBody = logRes ? await logRes.text().catch(() => "") : "";
      console.error("Core fax_log persist failed after Sinch accept", {
        faxId: faxData.id,
        logStatus: logRes?.status,
        logBody: logBody.slice(0, 500),
      });
      return NextResponse.json(
        {
          error:
            "Fax was accepted by Sinch but the internal fax log could not be saved. Retain the Fax ID for reconciliation.",
          faxId: faxData.id,
          sinchStatus: faxData.status || "queued",
          logStatus: logRes?.status ?? null,
          logDetail: logBody ? logBody.slice(0, 500) : "Unable to reach core service",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      faxId: faxData.id,
      faxLogPersisted: true,
      to: toNumber,
      pages: 2 + attachmentBuffers.length,
      status: faxData.status || "queued",
      timestamp: new Date().toISOString(),
      ...logPayload,
    });
  } catch (error) {
    console.error("Sinch fax transport error", {
      toNumber,
      patientName: payload.patientName,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Unable to reach Sinch fax service" },
      { status: 502 }
    );
  }
}
