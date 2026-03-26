// ── StrykeFox Fax System — Client API ──

export interface FaxSendPayload {
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
  authorizationOnFile?: boolean;
}

export interface FaxSendResult {
  success: boolean;
  faxId?: string;
  to?: string;
  pages?: number;
  status?: string;
  timestamp?: string;
  error?: string;
  detail?: string;
}

export interface FaxLogEntry {
  id: string | number;
  direction: "inbound" | "outbound";
  fax_number: string;
  facility?: string;
  patient_name?: string;
  patient_dob?: string;
  patient_mrn?: string;
  record_types?: string[];
  urgency?: string;
  status: string;
  pages: number;
  service?: string;
  sinch_fax_id?: string;
  sent_by?: string;
  timestamp?: string;
  created_at?: string;
}

export interface OcrResult {
  success: boolean;
  source: "server" | "client";
  fileName: string;
  fileType?: string;
  patientName?: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
  mrn?: string;
  insuranceId?: string;
  phone?: string;
  address?: string;
  rawText?: string;
  confidence?: number;
  error?: string;
  message?: string;
}

/**
 * Send a HIPAA-compliant fax via the Fax.Plus API.
 * Supports optional file attachments (authorization form, patient records, etc.)
 */
export async function sendFax(
  payload: FaxSendPayload,
  attachments: File[] = []
): Promise<FaxSendResult> {
  const formData = new FormData();
  formData.append("payload", JSON.stringify(payload));
  for (const file of attachments) {
    formData.append("attachments", file);
  }

  const res = await fetch("/api/fax/send", {
    method: "POST",
    body: formData,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || data.detail || `Fax send failed (${res.status})`);
  }

  return data as FaxSendResult;
}

/**
 * Fetch the fax transmission log.
 */
export async function fetchFaxLog(
  opts: { direction?: string; limit?: number; offset?: number } = {}
): Promise<{ entries: FaxLogEntry[]; total: number }> {
  const params = new URLSearchParams();
  if (opts.direction) params.set("direction", opts.direction);
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.offset) params.set("offset", String(opts.offset));

  const res = await fetch(`/api/fax/log?${params}`);
  const data = await res.json().catch(() => ({ entries: [], total: 0 }));

  if (!res.ok) {
    throw new Error(data.error || "Failed to fetch fax log");
  }

  return data;
}

/**
 * Store a fax log entry (client-side fallback when core is unavailable).
 */
export async function storeFaxLog(entry: Partial<FaxLogEntry>): Promise<void> {
  await fetch("/api/fax/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
}

/**
 * Upload a document for OCR processing.
 * Returns extracted patient fields or signals that client-side OCR is needed.
 */
export async function processOcr(file: File): Promise<OcrResult> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/fax/ocr", {
    method: "POST",
    body: formData,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || "OCR processing failed");
  }

  return data as OcrResult;
}
