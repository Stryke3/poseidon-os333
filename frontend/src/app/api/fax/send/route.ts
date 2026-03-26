import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const SINCH_FAX_BASE = "https://fax.api.sinch.com/v3";

interface FaxPayload {
  recipientFax: string;
  senderFax?: string;
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
}

function buildCoverPageHtml(payload: FaxPayload): string {
  const recordList = payload.recordTypes.length
    ? payload.recordTypes.map((r) => `<li>${r}</li>`).join("")
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

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; margin: 40px; color: #1e293b; }
  .header { border-bottom: 3px solid #0f766e; padding-bottom: 16px; margin-bottom: 24px; }
  .logo { font-size: 24px; font-weight: bold; color: #0f766e; }
  .subtitle { font-size: 11px; color: #64748b; letter-spacing: 2px; }
  .grid { display: flex; gap: 32px; margin-bottom: 24px; }
  .col { flex: 1; }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 11px; font-weight: bold; color: #0f766e; text-transform: uppercase;
    letter-spacing: 1px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px; }
  .field { margin-bottom: 6px; }
  .label { font-size: 10px; color: #94a3b8; text-transform: uppercase; }
  .value { font-size: 13px; font-weight: 600; }
  .urgency-stat { color: #dc2626; font-weight: bold; font-size: 14px; }
  .urgency-urgent { color: #d97706; font-weight: bold; }
  .records-list { list-style: none; padding: 0; }
  .records-list li { padding: 4px 0; font-size: 12px; }
  .records-list li::before { content: "\\2713  "; color: #0f766e; font-weight: bold; }
  .hipaa { margin-top: 32px; padding: 16px; background: #fffbeb; border: 1px solid #fbbf24;
    font-size: 9px; line-height: 1.5; color: #92400e; }
  .hipaa-title { font-weight: bold; font-size: 10px; margin-bottom: 4px; }
  .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #94a3b8; }
</style></head>
<body>
  <div class="header">
    <div class="logo">STRYKEFOX</div>
    <div class="subtitle">MEDICAL RECORDS REQUEST</div>
  </div>

  <div class="grid">
    <div class="col">
      <div class="section">
        <div class="section-title">From</div>
        <div class="field"><span class="label">Name: </span><span class="value">${payload.senderName || "N/A"}</span></div>
        <div class="field"><span class="label">Facility: </span><span class="value">${payload.senderFacility || "N/A"}</span></div>
        <div class="field"><span class="label">Fax: </span><span class="value">${payload.senderFax || "N/A"}</span></div>
      </div>
    </div>
    <div class="col">
      <div class="section">
        <div class="section-title">To</div>
        <div class="field"><span class="label">Name: </span><span class="value">${payload.recipientName || "N/A"}</span></div>
        <div class="field"><span class="label">Facility: </span><span class="value">${payload.recipientFacility || "N/A"}</span></div>
        <div class="field"><span class="label">Fax: </span><span class="value">${payload.recipientFax}</span></div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Patient Information</div>
    <div class="field"><span class="label">Patient Name: </span><span class="value">${payload.patientName}</span></div>
    <div class="field"><span class="label">Date of Birth: </span><span class="value">${payload.patientDOB || "N/A"}</span></div>
    <div class="field"><span class="label">MRN / Account #: </span><span class="value">${payload.patientMRN || "N/A"}</span></div>
  </div>

  <div class="section">
    <div class="section-title">Records Requested</div>
    <ul class="records-list">${recordList}</ul>
    <div class="field" style="margin-top:8px"><span class="label">Date Range: </span><span class="value">${dateInfo}</span></div>
    <div class="field"><span class="label">Urgency: </span><span class="value ${payload.urgency === "stat" ? "urgency-stat" : payload.urgency === "urgent" ? "urgency-urgent" : ""}">${urgencyLabel[payload.urgency] || payload.urgency}</span></div>
    ${payload.notes ? `<div class="field" style="margin-top:8px"><span class="label">Notes: </span><span class="value">${payload.notes}</span></div>` : ""}
  </div>

  <div class="hipaa">
    <div class="hipaa-title">CONFIDENTIALITY NOTICE</div>
    This facsimile transmission contains confidential information that is legally privileged.
    This information is intended only for the use of the individual or entity named above.
    The authorized recipient of this information is prohibited from disclosing this information
    to any other party unless required to do so by law or regulation and is required to destroy
    the information after its stated need has been fulfilled. If you are not the intended recipient,
    you are hereby notified that any disclosure, copying, distribution, or action taken in reliance
    on the contents of these documents is STRICTLY PROHIBITED. If you have received this fax in error,
    please notify the sender immediately by telephone to arrange for the return of the original documents.
  </div>

  <div class="footer">
    &copy; ${new Date().getFullYear()} StrykeFox Medical Platform &mdash; HIPAA Compliant &mdash; 45 CFR &sect;164
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

export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  if (!token?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Sinch credentials
  const SINCH_PROJECT_ID = process.env.SINCH_PROJECT_ID;
  const SINCH_KEY_ID = process.env.SINCH_KEY_ID;
  const SINCH_KEY_SECRET = process.env.SINCH_KEY_SECRET;

  if (!SINCH_PROJECT_ID || !SINCH_KEY_ID || !SINCH_KEY_SECRET) {
    return NextResponse.json(
      {
        error: "Fax service not configured. Set SINCH_PROJECT_ID, SINCH_KEY_ID, and SINCH_KEY_SECRET.",
      },
      { status: 503 }
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
          type: file.type || "application/pdf",
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

  const coverHtml = buildCoverPageHtml(payload);
  const toNumber = normalizeFaxNumber(payload.recipientFax);

  // Build Sinch Fax API multipart request
  const sinchBody = new FormData();
  sinchBody.append("to", toNumber);

  if (payload.senderFax) {
    sinchBody.append("from", normalizeFaxNumber(payload.senderFax));
  }

  // Header text appears at the top of each fax page
  sinchBody.append(
    "headerText",
    `StrykeFox Medical | ${payload.urgency === "stat" ? "STAT" : payload.urgency === "urgent" ? "URGENT" : "Routine"} | ${payload.patientName}`
  );

  // Callback URL for fax completion webhook
  const callbackBase = process.env.NEXTAUTH_URL || "http://localhost:3000";
  sinchBody.append("callbackUrl", `${callbackBase}/api/fax/inbound`);
  sinchBody.append("callbackUrlContentType", "application/json");

  // Attach cover page as HTML file
  const coverBlob = new Blob([coverHtml], { type: "text/html" });
  sinchBody.append("file", coverBlob, "cover_page.html");

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
      console.error("[fax/send] Sinch error:", faxRes.status, faxData);
      return NextResponse.json(
        {
          error: "Fax transmission failed",
          detail:
            faxData.message ||
            faxData.error?.message ||
            `HTTP ${faxRes.status}`,
          sinchStatus: faxRes.status,
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
      record_types: payload.recordTypes,
      urgency: payload.urgency,
      status: "sent",
      pages: 1 + attachmentBuffers.length,
      service: "sinch",
      sinch_fax_id: faxData.id || null,
      sent_by: token.email || "unknown",
    };

    // Fire-and-forget log to core
    const CORE_API_URL = process.env.CORE_API_URL || "http://core:8001";
    fetch(`${CORE_API_URL}/fax/log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.accessToken}`,
      },
      body: JSON.stringify(logPayload),
    }).catch(() => {
      // Log failure is non-critical
    });

    return NextResponse.json({
      success: true,
      faxId: faxData.id,
      to: toNumber,
      pages: 1 + attachmentBuffers.length,
      status: faxData.status || "queued",
      timestamp: new Date().toISOString(),
      ...logPayload,
    });
  } catch (err) {
    console.error("[fax/send] Network error:", err);
    return NextResponse.json(
      { error: "Unable to reach Sinch fax service" },
      { status: 502 }
    );
  }
}
