"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { signOut, useSession } from "next-auth/react";
import {
  sendFax,
  fetchFaxLog,
  storeFaxLog,
  processOcr,
  type FaxSendPayload,
  type FaxLogEntry,
  type OcrResult,
} from "@/lib/fax-api";

// ── Constants ──

const RECORD_TYPES = [
  "Complete Medical Records",
  "Imaging / Radiology Reports",
  "Lab Results",
  "Operative Notes",
  "Discharge Summary",
  "Progress Notes",
  "Pathology Reports",
  "Prescription History",
  "Billing Records",
  "Therapy / Rehab Notes",
];

const DATE_RANGES = [
  "Last 30 Days",
  "Last 90 Days",
  "Last 6 Months",
  "Last 12 Months",
  "Last 2 Years",
  "All Available Records",
  "Custom Date Range",
];

const HIPAA_NOTICE = `CONFIDENTIALITY NOTICE: This facsimile transmission contains confidential information that is legally privileged. This information is intended only for the use of the individual or entity named above. The authorized recipient of this information is prohibited from disclosing this information to any other party unless required to do so by law or regulation and is required to destroy the information after its stated need has been fulfilled. If you are not the intended recipient, you are hereby notified that any disclosure, copying, distribution, or action taken in reliance on the contents of these documents is STRICTLY PROHIBITED. If you have received this fax in error, please notify the sender immediately by telephone to arrange for the return of the original documents.`;

// ── Helpers ──

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function isValidFaxNumber(value: string): boolean {
  return value.replace(/\D/g, "").length >= 10;
}

function reviewBadgeClass(status?: string): string {
  switch (status) {
    case "pending_chart_review":
      return "bg-amber-100 text-amber-700";
    case "pending_patient_match":
      return "bg-orange-100 text-orange-700";
    case "unmatched":
      return "bg-red-100 text-red-700";
    case "linked_to_chart":
    case "reviewed":
      return "bg-emerald-100 text-emerald-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function reviewLabel(status?: string): string {
  switch (status) {
    case "pending_chart_review":
      return "Review Chart";
    case "pending_patient_match":
      return "Link Or Create";
    case "unmatched":
      return "Unmatched";
    case "linked_to_chart":
      return "Linked";
    case "reviewed":
      return "Reviewed";
    default:
      return "Logged";
  }
}

// ── Client-side OCR with Tesseract.js (lazy-loaded) ──

async function runClientOcr(
  file: File,
  onProgress?: (pct: number) => void
): Promise<{
  text: string;
  confidence: number;
  patientName: string;
  dob: string;
  mrn: string;
  insuranceId: string;
  phone: string;
  address: string;
}> {
  const Tesseract = await import("tesseract.js");
  const worker = await Tesseract.createWorker("eng", undefined, {
    logger: (m: { progress?: number }) => {
      if (m.progress && onProgress) onProgress(Math.round(m.progress * 100));
    },
  });

  let imageSource: string | File = file;

  // For PDFs, we need to convert to image first using canvas
  if (file.type === "application/pdf") {
    // Can't OCR PDF directly in browser without pdf.js — use the raw file
    // Tesseract handles common image formats; PDF requires server-side
    imageSource = file;
  }

  const {
    data: { text, confidence },
  } = await worker.recognize(imageSource);
  await worker.terminate();

  // Extract structured fields from OCR text using pattern matching
  const extracted = extractFieldsFromText(text);

  return {
    text,
    confidence: confidence / 100,
    ...extracted,
  };
}

function extractFieldsFromText(text: string) {
  const lines = text.split("\n").map((l) => l.trim());
  let patientName = "";
  let dob = "";
  let mrn = "";
  let insuranceId = "";
  let phone = "";
  let address = "";

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Patient name patterns
    if (!patientName) {
      const nameMatch = line.match(
        /(?:patient\s*(?:name)?|name)\s*[:\-]?\s*([A-Z][a-zA-Z]+[\s,]+[A-Z][a-zA-Z]+(?:\s+[A-Z]\.?)?)/i
      );
      if (nameMatch) patientName = nameMatch[1].trim();
    }

    // DOB patterns
    if (!dob) {
      const dobMatch = line.match(
        /(?:d\.?o\.?b\.?|date\s*of\s*birth|birth\s*date)\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i
      );
      if (dobMatch) dob = dobMatch[1];
    }

    // MRN patterns
    if (!mrn) {
      const mrnMatch = line.match(
        /(?:mrn|medical\s*record|acct?\.?\s*#?|account)\s*[:\-#]?\s*([A-Z0-9]{4,15})/i
      );
      if (mrnMatch) mrn = mrnMatch[1];
    }

    // Insurance ID patterns
    if (!insuranceId) {
      const insMatch = line.match(
        /(?:insurance\s*(?:id|#|no\.?)|member\s*(?:id|#)|policy\s*(?:id|#|no\.?)|group\s*(?:id|#))\s*[:\-]?\s*([A-Z0-9]{5,20})/i
      );
      if (insMatch) insuranceId = insMatch[1];
    }

    // Phone patterns
    if (!phone) {
      const phoneMatch = line.match(
        /(?:phone|tel|contact|ph\.?)\s*[:\-]?\s*\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/i
      );
      if (phoneMatch) {
        const digits = phoneMatch[0].replace(/\D/g, "").slice(-10);
        phone = formatPhone(digits);
      }
    }

    // Address patterns
    if (!address && /\d+\s+[A-Z][a-z]+\s+(St|Ave|Blvd|Dr|Rd|Ln|Ct|Way|Pl)/i.test(line)) {
      address = line;
    }
  }

  return { patientName, dob, mrn, insuranceId, phone, address };
}

// ── Component ──

export default function StrykeFoxFaxSystem() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState("send");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [faxLog, setFaxLog] = useState<FaxLogEntry[]>([]);
  const [faxLogLoading, setFaxLogLoading] = useState(false);
  const [intakeMode, setIntakeMode] = useState<"new" | "existing">("new");
  const [intakeSaving, setIntakeSaving] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ocrFileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    recipientFax: "",
    senderFax: "",
    recipientName: "",
    recipientFacility: "",
    senderName: session?.user?.name || "Adams Stryker SFM",
    senderFacility: "StrykeFox Medical Platform",
    patientName: "",
    patientDOB: "",
    patientMRN: "",
    recordTypes: [] as string[],
    dateRange: "All Available Records",
    customStart: "",
    customEnd: "",
    urgency: "routine",
    notes: "",
    authorizationOnFile: false,
    releaseSignedBy: "",
    releaseSignerRelationship: "Self",
    releaseSignedAt: new Date().toISOString().slice(0, 10),
    releasePurpose: "Continuity of care",
    releaseAuthorizedBy: "Patient-executed release",
    attachments: [] as File[],
  });

  const [patientIntake, setPatientIntake] = useState({
    firstName: "",
    lastName: "",
    dob: "",
    mrn: "",
    insuranceId: "",
    phone: "",
    address: "",
    existingChartId: "",
  });

  const [apiConfig, setApiConfig] = useState({
    service: "faxplus",
    apiKey: "",
    defaultSender: "Adams Stryker SFM",
    defaultFacility: "StrykeFox Medical Platform",
  });

  // Load fax log on tab switch
  useEffect(() => {
    if (activeTab === "log") {
      loadFaxLog();
    }
  }, [activeTab]);

  const loadFaxLog = async () => {
    setFaxLogLoading(true);
    try {
      const data = await fetchFaxLog({ limit: 50 });
      if (data.entries?.length) {
        setFaxLog(data.entries);
      }
    } catch {
      // If server log unavailable, keep local state
    }
    setFaxLogLoading(false);
  };

  const updateForm = useCallback(
    (field: string, value: unknown) =>
      setForm((p) => ({ ...p, [field]: value })),
    []
  );

  const updateIntake = useCallback(
    (field: string, value: string) =>
      setPatientIntake((p) => ({ ...p, [field]: value })),
    []
  );

  const toggleRecordType = (type: string) => {
    setForm((p) => ({
      ...p,
      recordTypes: p.recordTypes.includes(type)
        ? p.recordTypes.filter((t) => t !== type)
        : [...p.recordTypes, type],
    }));
  };

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    updateForm("attachments", [...form.attachments, ...files]);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  // ── OCR Handler ──

  const handleOCRUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setOcrProcessing(true);
    setOcrProgress(0);
    setOcrResult(null);

    try {
      // Try server-side OCR first
      const serverResult = await processOcr(file);

      if (serverResult.source === "server" && serverResult.rawText) {
        setOcrResult(serverResult);
      } else {
        // Fall back to client-side Tesseract.js
        const clientResult = await runClientOcr(file, setOcrProgress);
        setOcrResult({
          success: true,
          source: "client",
          fileName: file.name,
          fileType: file.type,
          patientName: clientResult.patientName,
          dob: clientResult.dob,
          mrn: clientResult.mrn,
          insuranceId: clientResult.insuranceId,
          phone: clientResult.phone,
          address: clientResult.address,
          rawText: clientResult.text,
          confidence: clientResult.confidence,
        });
      }
    } catch (err) {
      setOcrResult({
        success: false,
        source: "client",
        fileName: file.name,
        error: err instanceof Error ? err.message : "OCR processing failed",
      });
    }

    setOcrProcessing(false);
  };

  const applyOCRToIntake = () => {
    if (!ocrResult) return;
    if (ocrResult.patientName) {
      const parts = ocrResult.patientName.split(/[\s,]+/);
      updateIntake("firstName", parts[0] || "");
      updateIntake("lastName", parts.slice(1).join(" ") || "");
    }
    if (ocrResult.firstName) updateIntake("firstName", ocrResult.firstName);
    if (ocrResult.lastName) updateIntake("lastName", ocrResult.lastName);
    if (ocrResult.dob) updateIntake("dob", ocrResult.dob);
    if (ocrResult.mrn) updateIntake("mrn", ocrResult.mrn);
    if (ocrResult.insuranceId)
      updateIntake("insuranceId", ocrResult.insuranceId);
    if (ocrResult.phone) updateIntake("phone", ocrResult.phone);
    if (ocrResult.address) updateIntake("address", ocrResult.address);
  };

  // ── Send Fax Handler ──

  const handleSendFax = async () => {
    if (!form.recipientFax || !form.patientName || !form.authorizationOnFile)
      return;

    setSending(true);
    setSendResult(null);

    const payload: FaxSendPayload = {
      recipientFax: form.recipientFax,
      senderFax: form.senderFax,
      recipientName: form.recipientName,
      recipientFacility: form.recipientFacility,
      senderName: form.senderName,
      senderFacility: form.senderFacility,
      patientName: form.patientName,
      patientDOB: form.patientDOB,
      patientMRN: form.patientMRN,
      recordTypes: form.recordTypes,
      dateRange: form.dateRange,
      customStart: form.customStart,
      customEnd: form.customEnd,
      urgency: form.urgency,
      notes: form.notes,
      authorizationOnFile: form.authorizationOnFile,
      releaseSignedBy: form.releaseSignedBy,
      releaseSignerRelationship: form.releaseSignerRelationship,
      releaseSignedAt: form.releaseSignedAt,
      releasePurpose: form.releasePurpose,
      releaseAuthorizedBy: form.releaseAuthorizedBy,
      releaseAttachmentLabel: `${form.patientName || "patient"}_release_authorization`,
    };

    try {
      const result = await sendFax(payload, form.attachments);

      // Add to local log
      const logEntry: FaxLogEntry = {
        id: result.faxId || Date.now().toString(),
        direction: "outbound",
        fax_number: result.to || form.recipientFax,
        facility: form.recipientFacility,
        patient_name: form.patientName,
        patient_dob: form.patientDOB,
        patient_mrn: form.patientMRN,
        record_types: form.recordTypes,
        urgency: form.urgency,
        status: result.status || "sent",
        pages: result.pages || 1 + form.attachments.length,
        service: "Sinch",
        sinch_fax_id: result.faxId,
        sent_by: session?.user?.email || "unknown",
        timestamp: result.timestamp || new Date().toISOString(),
        release_metadata: {
          authorization_on_file: form.authorizationOnFile,
          signed_by: form.releaseSignedBy,
          signer_relationship: form.releaseSignerRelationship,
          signed_at: form.releaseSignedAt,
          purpose: form.releasePurpose,
        },
      };

      setFaxLog((prev) => [logEntry, ...prev]);

      setSendResult({
        type: "success",
        message: `Fax queued successfully to ${result.to} (${result.pages} pages). ID: ${result.faxId || "N/A"}`,
      });

      // Reset form partially (keep sender info)
      setForm((prev) => ({
        ...prev,
        recipientFax: "",
        recipientName: "",
        recipientFacility: "",
        patientName: "",
        patientDOB: "",
        patientMRN: "",
        recordTypes: [],
        dateRange: "All Available Records",
        customStart: "",
        customEnd: "",
        urgency: "routine",
        notes: "",
        authorizationOnFile: false,
        releaseSignedBy: "",
        releaseSignerRelationship: "Self",
        releaseSignedAt: new Date().toISOString().slice(0, 10),
        releasePurpose: "Continuity of care",
        releaseAuthorizedBy: "Patient-executed release",
        attachments: [],
      }));
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Unknown error sending fax";
      setSendResult({ type: "error", message: msg });
      if (/session expired|sign in again/i.test(msg)) {
        setTimeout(() => {
          signOut({ callbackUrl: "/login" }).catch(() => {});
        }, 1200);
      }

      // Store failed attempt in log
      const failEntry: FaxLogEntry = {
        id: Date.now().toString(),
        direction: "outbound",
        fax_number: form.recipientFax,
        facility: form.recipientFacility,
        patient_name: form.patientName,
        status: "failed",
        pages: 1 + form.attachments.length,
        service: "Sinch",
        sent_by: session?.user?.email || "unknown",
        timestamp: new Date().toISOString(),
      };
      setFaxLog((prev) => [failEntry, ...prev]);
      storeFaxLog(failEntry).catch(() => {});
    }

    setSending(false);
    setTimeout(() => setSendResult(null), 8000);
  };

  // ── Patient Intake Save ──

  const handleSaveIntake = async () => {
    setIntakeSaving(true);
    try {
      const patientPayload = {
        first_name: patientIntake.firstName,
        last_name: patientIntake.lastName,
        dob: patientIntake.dob,
        mrn: patientIntake.mrn,
        insurance_id: patientIntake.insuranceId,
        phone: patientIntake.phone,
        address: patientIntake.address,
      };

      const endpoint =
        intakeMode === "existing" && patientIntake.existingChartId
          ? `/api/patients/${patientIntake.existingChartId}`
          : "/api/patients";

      const method = intakeMode === "existing" ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patientPayload),
      });

      if (res.ok) {
        setSendResult({
          type: "success",
          message:
            intakeMode === "new"
              ? "Patient chart created successfully"
              : "Patient chart updated successfully",
        });
        setPatientIntake({
          firstName: "",
          lastName: "",
          dob: "",
          mrn: "",
          insuranceId: "",
          phone: "",
          address: "",
          existingChartId: "",
        });
      } else {
        const data = await res.json().catch(() => ({}));
        setSendResult({
          type: "error",
          message: data.error || "Failed to save patient chart",
        });
      }
    } catch {
      setSendResult({
        type: "error",
        message: "Unable to reach patient service",
      });
    }
    setIntakeSaving(false);
    setTimeout(() => setSendResult(null), 6000);
  };

  // ── Config Save ──
  const handleSaveConfig = () => {
    // In production this would persist to a settings table
    localStorage.setItem("strykefox-fax-config", JSON.stringify(apiConfig));
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 3000);
  };

  // Load config on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("strykefox-fax-config");
      if (saved) setApiConfig(JSON.parse(saved));
    } catch {}
  }, []);

  // ── Tab definitions ──
  const tabs = [
    { id: "send", label: "Send Fax", icon: "\u{1F4E4}" },
    { id: "intake", label: "OCR Intake", icon: "\u{1F4CB}" },
    { id: "log", label: "Fax Log", icon: "\u{1F4D1}" },
    { id: "config", label: "Config", icon: "\u2699\uFE0F" },
  ];

  const canSend =
    isValidFaxNumber(form.recipientFax) &&
    form.patientName.trim().length > 0 &&
    form.authorizationOnFile &&
    form.releaseSignedBy.trim().length > 0 &&
    form.releaseSignedAt.trim().length > 0;

  // ── Shared styles ──
  const inputClass =
    "w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white";
  const monoInputClass = `${inputClass} font-mono`;
  const labelClass =
    "block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5";

  return (
    <div
      style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}
      className="min-h-screen bg-slate-50"
    >
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-700 to-teal-500 flex items-center justify-center">
              <span className="text-white font-bold font-mono text-sm">SF</span>
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-slate-900 tracking-tight leading-none">
                STRYKEFOX
              </h1>
              <p className="text-[9px] text-slate-500 tracking-[2.5px] leading-none mt-0.5">
                MEDICAL RECORDS
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/intake/new"
              className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-900 text-white transition hover:bg-slate-700"
            >
              New Patient Intake
            </a>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              HIPAA Compliant
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              256-bit TLS
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all ${
                activeTab === tab.id
                  ? "border-teal-600 text-teal-700 bg-teal-50/40"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span className="mr-1.5">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Global Result Banner */}
      {sendResult && (
        <div className="max-w-5xl mx-auto px-4 mt-4">
          <div
            className={`rounded-xl px-5 py-3 text-sm font-semibold flex items-center justify-between ${
              sendResult.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            <span>
              {sendResult.type === "success" ? "\u2713 " : "\u2717 "}
              {sendResult.message}
            </span>
            <button
              onClick={() => setSendResult(null)}
              className="text-lg leading-none opacity-60 hover:opacity-100"
            >
              \u00D7
            </button>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* ═══ SEND FAX TAB ═══ */}
        {activeTab === "send" && (
          <div className="space-y-5">
            {/* Fax Routing */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-slate-800 text-white flex items-center gap-2">
                <span className="text-base">{"\u{1F4E0}"}</span>
                <span className="text-sm font-bold tracking-wide">
                  FAX ROUTING
                </span>
              </div>
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Recipient Fax Number *</label>
                  <input
                    type="tel"
                    placeholder="(___) ___-____"
                    value={form.recipientFax}
                    onChange={(e) => {
                      const formatted = formatPhone(e.target.value);
                      updateForm("recipientFax", formatted);
                    }}
                    className={`${monoInputClass} ${
                      form.recipientFax &&
                      !isValidFaxNumber(form.recipientFax)
                        ? "border-red-300 focus:ring-red-400"
                        : ""
                    }`}
                  />
                  {form.recipientFax &&
                    !isValidFaxNumber(form.recipientFax) && (
                      <p className="text-xs text-red-500 mt-1">
                        Enter a valid 10-digit fax number
                      </p>
                    )}
                  {!form.recipientFax && (
                    <p className="text-xs text-slate-400 mt-1">
                      Test number: (989) 898-9898 (free, no charge)
                    </p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Sender Fax / Callback</label>
                  <input
                    type="tel"
                    placeholder="Optional callback number"
                    value={form.senderFax}
                    onChange={(e) =>
                      updateForm("senderFax", formatPhone(e.target.value))
                    }
                    className={monoInputClass}
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    This is shown on the cover page only unless a verified Sinch sender number is configured.
                  </p>
                </div>
                <div>
                  <label className={labelClass}>Recipient Name / Attn</label>
                  <input
                    type="text"
                    placeholder="Medical Records Department"
                    value={form.recipientName}
                    onChange={(e) =>
                      updateForm("recipientName", e.target.value)
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Recipient Facility</label>
                  <input
                    type="text"
                    placeholder="Hospital / Clinic Name"
                    value={form.recipientFacility}
                    onChange={(e) =>
                      updateForm("recipientFacility", e.target.value)
                    }
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {/* Patient Info */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-teal-700 text-white flex items-center gap-2">
                <span className="text-base">{"\u{1F3E5}"}</span>
                <span className="text-sm font-bold tracking-wide">
                  PATIENT INFORMATION
                </span>
              </div>
              <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Patient Full Name *</label>
                  <input
                    type="text"
                    placeholder="Last, First M."
                    value={form.patientName}
                    onChange={(e) =>
                      updateForm("patientName", e.target.value)
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Date of Birth</label>
                  <input
                    type="date"
                    value={form.patientDOB}
                    onChange={(e) =>
                      updateForm("patientDOB", e.target.value)
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>MRN / Account #</label>
                  <input
                    type="text"
                    placeholder="Optional"
                    value={form.patientMRN}
                    onChange={(e) =>
                      updateForm("patientMRN", e.target.value)
                    }
                    className={monoInputClass}
                  />
                </div>
              </div>
            </div>

            {/* Records Requested */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-slate-700 text-white flex items-center gap-2">
                <span className="text-base">{"\u{1F4CB}"}</span>
                <span className="text-sm font-bold tracking-wide">
                  RECORDS REQUESTED
                </span>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                  {RECORD_TYPES.map((type) => (
                    <button
                      key={type}
                      onClick={() => toggleRecordType(type)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all text-left ${
                        form.recordTypes.includes(type)
                          ? "bg-teal-50 border-teal-400 text-teal-800 shadow-sm"
                          : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <span className="mr-1">
                        {form.recordTypes.includes(type) ? "\u2713" : "\u25CB"}
                      </span>
                      {type}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
                  <div>
                    <label className={labelClass}>Date Range</label>
                    <select
                      value={form.dateRange}
                      onChange={(e) =>
                        updateForm("dateRange", e.target.value)
                      }
                      className={inputClass}
                    >
                      {DATE_RANGES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Urgency</label>
                    <select
                      value={form.urgency}
                      onChange={(e) =>
                        updateForm("urgency", e.target.value)
                      }
                      className={inputClass}
                    >
                      <option value="routine">
                        Routine (5-10 business days)
                      </option>
                      <option value="urgent">Urgent (24-48 hours)</option>
                      <option value="stat">STAT (Immediate)</option>
                    </select>
                  </div>
                </div>

                {form.dateRange === "Custom Date Range" && (
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <label className={`${labelClass} mb-1`}>Start Date</label>
                      <input
                        type="date"
                        value={form.customStart}
                        onChange={(e) =>
                          updateForm("customStart", e.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={`${labelClass} mb-1`}>End Date</label>
                      <input
                        type="date"
                        value={form.customEnd}
                        onChange={(e) =>
                          updateForm("customEnd", e.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <label className={labelClass}>
                    Additional Notes / Purpose
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Continuity of care, second opinion, legal request..."
                    value={form.notes}
                    onChange={(e) => updateForm("notes", e.target.value)}
                    className={`${inputClass} resize-none`}
                  />
                </div>
              </div>
            </div>

            {/* Authorization + Attachments */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={form.authorizationOnFile}
                  onChange={(e) =>
                    updateForm("authorizationOnFile", e.target.checked)
                  }
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    Valid HIPAA Authorization on File
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    I confirm a signed patient authorization (45 CFR
                    \u00A7164.508) is on file for this records request.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Release Signed By *</label>
                  <input
                    type="text"
                    placeholder="Patient or legal representative"
                    value={form.releaseSignedBy}
                    onChange={(e) => updateForm("releaseSignedBy", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Signer Relationship *</label>
                  <select
                    value={form.releaseSignerRelationship}
                    onChange={(e) => updateForm("releaseSignerRelationship", e.target.value)}
                    className={inputClass}
                  >
                    <option value="Self">Self</option>
                    <option value="Parent / Guardian">Parent / Guardian</option>
                    <option value="Healthcare Proxy">Healthcare Proxy</option>
                    <option value="Power of Attorney">Power of Attorney</option>
                    <option value="Personal Representative">Personal Representative</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Release Signature Date *</label>
                  <input
                    type="date"
                    value={form.releaseSignedAt}
                    onChange={(e) => updateForm("releaseSignedAt", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Release Purpose</label>
                  <input
                    type="text"
                    value={form.releasePurpose}
                    onChange={(e) => updateForm("releasePurpose", e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Release Authorized By</label>
                <input
                  type="text"
                  value={form.releaseAuthorizedBy}
                  onChange={(e) => updateForm("releaseAuthorizedBy", e.target.value)}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-slate-500">
                  A release authorization page will be generated automatically and attached to the fax.
                </p>
              </div>

              <div>
                <label className={`${labelClass} mb-2`}>
                  Attachments (Authorization Form, ID, etc.)
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50/30 transition-all"
                >
                  <p className="text-sm text-slate-500">
                    Click to attach files (PDF, JPG, PNG, TIFF)
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {form.attachments.length} file(s) attached
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.tiff"
                  onChange={handleFileAttach}
                  className="hidden"
                />
                {form.attachments.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {form.attachments.map((f, i) => (
                      <div
                        key={`${f.name}-${i}`}
                        className="flex items-center justify-between bg-slate-50 rounded px-3 py-1.5 text-xs"
                      >
                        <span className="font-mono text-slate-600 truncate">
                          {f.name}{" "}
                          <span className="text-slate-400">
                            ({(f.size / 1024).toFixed(1)} KB)
                          </span>
                        </span>
                        <button
                          onClick={() =>
                            updateForm(
                              "attachments",
                              form.attachments.filter((_, j) => j !== i)
                            )
                          }
                          className="text-red-400 hover:text-red-600 font-bold ml-2"
                        >
                          \u00D7
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* HIPAA Notice */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-1">
                {"\u26A0"} HIPAA Confidentiality Notice
              </p>
              <p className="text-xs text-amber-700 leading-relaxed">
                {HIPAA_NOTICE}
              </p>
            </div>

            {/* Send Button */}
            <div className="flex items-center gap-4">
              <button
                onClick={handleSendFax}
                disabled={sending || !canSend}
                className={`flex-1 py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all shadow-lg ${
                  sending
                    ? "bg-slate-400 text-white cursor-wait"
                    : !canSend
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                      : "bg-teal-700 text-white hover:bg-teal-800 active:scale-[0.98]"
                }`}
              >
                {sending
                  ? "TRANSMITTING SECURE FAX..."
                  : `${"\u{1F4E0}"} SEND HIPAA-COMPLIANT FAX`}
              </button>
            </div>

            {!form.authorizationOnFile &&
              form.recipientFax &&
              form.patientName && (
                <p className="text-xs text-red-500 font-semibold text-center -mt-2">
                  {"\u2610"} Authorization confirmation required before sending
                </p>
              )}
            {form.authorizationOnFile &&
              (!form.releaseSignedBy.trim() || !form.releaseSignedAt.trim()) &&
              form.recipientFax &&
              form.patientName && (
                <p className="text-xs text-red-500 font-semibold text-center -mt-2">
                  {"\u2610"} Patient-executed release signer and signed date are required
                </p>
              )}
          </div>
        )}

        {/* ═══ OCR INTAKE TAB ═══ */}
        {activeTab === "intake" && (
          <div className="space-y-5">
            {/* OCR Scanner */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-indigo-700 text-white flex items-center gap-2">
                <span className="text-base">{"\u{1F50D}"}</span>
                <span className="text-sm font-bold tracking-wide">
                  OCR DOCUMENT SCANNER
                </span>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-sm text-slate-600">
                  Upload a patient document (insurance card, intake form,
                  referral, fax) to extract data via OCR and populate the
                  patient chart.
                </p>

                <div
                  onClick={() => ocrFileRef.current?.click()}
                  className="border-2 border-dashed border-indigo-300 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50/30 transition-all"
                >
                  {ocrProcessing ? (
                    <div className="space-y-3">
                      <div
                        className="w-10 h-10 border-[3px] border-indigo-300 border-t-indigo-600 rounded-full animate-spin mx-auto"
                      />
                      <p className="text-sm font-semibold text-indigo-600">
                        Processing OCR...{" "}
                        {ocrProgress > 0 && `${ocrProgress}%`}
                      </p>
                      {ocrProgress > 0 && (
                        <div className="w-48 mx-auto h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                            style={{ width: `${ocrProgress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <p className="text-3xl mb-2">{"\u{1F4C4}"}</p>
                      <p className="text-sm font-semibold text-slate-700">
                        Drop or click to scan document
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        PDF, JPG, PNG, TIFF — max 10MB
                      </p>
                      <p className="text-xs text-indigo-500 mt-2 font-medium">
                        Powered by Tesseract.js OCR Engine
                      </p>
                    </>
                  )}
                </div>
                <input
                  ref={ocrFileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.tiff"
                  onChange={handleOCRUpload}
                  className="hidden"
                />

                {/* OCR Results */}
                {ocrResult && !ocrResult.error && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-indigo-800">
                        OCR Results — {ocrResult.fileName}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-indigo-500 font-medium">
                          {ocrResult.source === "server"
                            ? "Server OCR"
                            : "Client OCR"}
                        </span>
                        {ocrResult.confidence !== undefined && (
                          <span
                            className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                              ocrResult.confidence > 0.8
                                ? "bg-emerald-100 text-emerald-700"
                                : ocrResult.confidence > 0.5
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-red-100 text-red-700"
                            }`}
                          >
                            {Math.round(ocrResult.confidence * 100)}% confidence
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Extracted fields preview */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {[
                        {
                          label: "Name",
                          value: ocrResult.patientName,
                        },
                        { label: "DOB", value: ocrResult.dob },
                        { label: "MRN", value: ocrResult.mrn },
                        {
                          label: "Insurance ID",
                          value: ocrResult.insuranceId,
                        },
                        { label: "Phone", value: ocrResult.phone },
                        { label: "Address", value: ocrResult.address },
                      ]
                        .filter((f) => f.value)
                        .map((f) => (
                          <div
                            key={f.label}
                            className="bg-white rounded-lg px-3 py-2 border border-indigo-100"
                          >
                            <p className="text-[10px] text-indigo-500 font-bold uppercase">
                              {f.label}
                            </p>
                            <p className="text-xs font-semibold text-slate-800 truncate">
                              {f.value}
                            </p>
                          </div>
                        ))}
                    </div>

                    {ocrResult.rawText && (
                      <pre className="text-xs font-mono text-slate-600 bg-white rounded-lg p-3 border border-indigo-100 whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {ocrResult.rawText}
                      </pre>
                    )}

                    <button
                      onClick={applyOCRToIntake}
                      className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      Apply Extracted Data to Patient Form {"\u2193"}
                    </button>
                  </div>
                )}

                {ocrResult?.error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <p className="text-sm font-semibold text-red-700">
                      OCR Error: {ocrResult.error}
                    </p>
                    <p className="text-xs text-red-500 mt-1">
                      Try a clearer scan or different file format.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Patient Chart Intake */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-slate-800 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">{"\u{1F464}"}</span>
                  <span className="text-sm font-bold tracking-wide">
                    PATIENT CHART INTAKE
                  </span>
                </div>
                <div className="flex bg-slate-700 rounded-lg p-0.5">
                  <button
                    onClick={() => setIntakeMode("new")}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                      intakeMode === "new"
                        ? "bg-teal-600 text-white"
                        : "text-slate-300 hover:text-white"
                    }`}
                  >
                    New Patient
                  </button>
                  <button
                    onClick={() => setIntakeMode("existing")}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                      intakeMode === "existing"
                        ? "bg-teal-600 text-white"
                        : "text-slate-300 hover:text-white"
                    }`}
                  >
                    Existing Chart
                  </button>
                </div>
              </div>

              <div className="p-5 space-y-4">
                {intakeMode === "existing" && (
                  <div>
                    <label className={labelClass}>
                      Search Existing Chart (MRN or Name)
                    </label>
                    <input
                      type="text"
                      placeholder="Enter MRN or patient name to search..."
                      value={patientIntake.existingChartId}
                      onChange={(e) =>
                        updateIntake("existingChartId", e.target.value)
                      }
                      className={monoInputClass}
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>First Name</label>
                    <input
                      type="text"
                      value={patientIntake.firstName}
                      onChange={(e) =>
                        updateIntake("firstName", e.target.value)
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Last Name</label>
                    <input
                      type="text"
                      value={patientIntake.lastName}
                      onChange={(e) =>
                        updateIntake("lastName", e.target.value)
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Date of Birth</label>
                    <input
                      type="date"
                      value={patientIntake.dob}
                      onChange={(e) => updateIntake("dob", e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>MRN</label>
                    <input
                      type="text"
                      value={patientIntake.mrn}
                      onChange={(e) => updateIntake("mrn", e.target.value)}
                      className={monoInputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Insurance ID</label>
                    <input
                      type="text"
                      value={patientIntake.insuranceId}
                      onChange={(e) =>
                        updateIntake("insuranceId", e.target.value)
                      }
                      className={monoInputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Phone</label>
                    <input
                      type="tel"
                      value={patientIntake.phone}
                      onChange={(e) =>
                        updateIntake(
                          "phone",
                          formatPhone(e.target.value)
                        )
                      }
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Address</label>
                  <input
                    type="text"
                    value={patientIntake.address}
                    onChange={(e) =>
                      updateIntake("address", e.target.value)
                    }
                    className={inputClass}
                  />
                </div>

                <button
                  onClick={handleSaveIntake}
                  disabled={
                    intakeSaving ||
                    (!patientIntake.firstName && !patientIntake.lastName)
                  }
                  className={`w-full py-3 rounded-xl text-sm font-bold tracking-wide transition-all shadow-lg ${
                    intakeSaving
                      ? "bg-slate-400 text-white cursor-wait"
                      : !patientIntake.firstName && !patientIntake.lastName
                        ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                        : "bg-emerald-700 text-white hover:bg-emerald-800 active:scale-[0.98]"
                  }`}
                >
                  {intakeSaving
                    ? "SAVING..."
                    : intakeMode === "new"
                      ? "\u2713 CREATE NEW PATIENT CHART"
                      : "\u2713 UPDATE EXISTING CHART"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ FAX LOG TAB ═══ */}
        {activeTab === "log" && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-700">
                Transmission Log
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={loadFaxLog}
                  disabled={faxLogLoading}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  {faxLogLoading ? "Loading..." : "Refresh"}
                </button>
                <span className="text-xs text-slate-400">
                  {faxLog.length} entries
                </span>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-slate-800 text-white flex items-center gap-2">
                <span className="text-base">{"\u{1F4D1}"}</span>
                <span className="text-sm font-bold tracking-wide">
                  TRANSMISSION LOG
                </span>
              </div>

              {faxLog.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  <p className="text-3xl mb-2">{"\u{1F4ED}"}</p>
                  <p className="text-sm font-semibold">
                    No fax transmissions yet
                  </p>
                  <p className="text-xs mt-1">
                    Sent faxes will appear here with full audit trail
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {faxLog.map((entry) => (
                    <div
                      key={entry.id}
                      className="px-5 py-3 flex items-center justify-between hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs ${
                              entry.direction === "inbound"
                                ? "text-blue-500"
                                : "text-emerald-500"
                            }`}
                          >
                            {entry.direction === "inbound"
                              ? "\u2B07"
                              : "\u2B06"}
                          </span>
                          <p className="text-sm font-semibold text-slate-800 truncate">
                            {entry.facility || entry.fax_number}
                          </p>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {entry.patient_name
                            ? `Patient: ${entry.patient_name} \u00B7 `
                            : ""}
                          {entry.direction === "inbound"
                            ? `Return #: ${entry.fax_number} \u00B7 `
                            : ""}
                          {entry.pages} page(s)
                          {entry.service ? ` \u00B7 ${entry.service}` : ""}
                          {entry.sent_by ? ` \u00B7 ${entry.sent_by}` : ""}
                        </p>
                        {entry.review_reason ? (
                          <p className="text-xs text-amber-700 mt-1">
                            {entry.review_reason}
                          </p>
                        ) : null}
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          {entry.patient_id ? (
                            <a
                              href={`/patients/${entry.patient_id}`}
                              className="font-semibold text-blue-600 hover:text-blue-700"
                            >
                              Open linked patient chart
                            </a>
                          ) : null}
                          {entry.direction === "inbound" && !entry.patient_id ? (
                            <span className="text-slate-500">
                              Review this fax and either link it to an existing chart or create a new patient.
                            </span>
                          ) : null}
                        </div>
                        {entry.record_types &&
                          entry.record_types.length > 0 && (
                            <p className="text-xs text-slate-400 mt-0.5 truncate">
                              {entry.record_types.join(", ")}
                            </p>
                          )}
                      </div>
                      <div className="text-right ml-4 flex-shrink-0">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                            entry.status === "sent" ||
                            entry.status === "queued"
                              ? "bg-emerald-100 text-emerald-700"
                              : entry.status === "received"
                                ? "bg-blue-100 text-blue-700"
                                : entry.status === "failed"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {entry.status.toUpperCase()}
                        </span>
                        {entry.direction === "inbound" ? (
                          <span
                            className={`ml-1 inline-block px-2 py-0.5 rounded-full text-xs font-bold ${reviewBadgeClass(entry.review_status)}`}
                          >
                            {reviewLabel(entry.review_status).toUpperCase()}
                          </span>
                        ) : null}
                        {entry.urgency && entry.urgency !== "routine" && (
                          <span
                            className={`ml-1 inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                              entry.urgency === "stat"
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {entry.urgency.toUpperCase()}
                          </span>
                        )}
                        <p className="text-xs text-slate-400 mt-1 font-mono">
                          {new Date(
                            entry.timestamp ||
                              entry.created_at ||
                              ""
                          ).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ CONFIG TAB ═══ */}
        {activeTab === "config" && (
          <div className="space-y-5">
            {/* Service Selection */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-slate-800 text-white flex items-center gap-2">
                <span className="text-base">{"\u2699\uFE0F"}</span>
                <span className="text-sm font-bold tracking-wide">
                  FAX SERVICE CONFIGURATION
                </span>
              </div>
              <div className="p-5 space-y-3">
                {[
                  {
                    key: "faxplus",
                    name: "Sinch Fax API (Primary)",
                    note: "Production fax API — HIPAA + SOC 2 compliant",
                    endpoint: "fax.api.sinch.com/v3",
                  },
                  {
                    key: "gotfreefax",
                    name: "GotFreeFax (Fallback)",
                    note: "Free 3 pages/day — web integration",
                    endpoint: "gotfreefax.com",
                  },
                  {
                    key: "faxzero",
                    name: "FaxZero (Fallback)",
                    note: "5 free faxes/day — ad-supported cover page",
                    endpoint: "faxzero.com",
                  },
                ].map((svc) => (
                  <button
                    key={svc.key}
                    onClick={() =>
                      setApiConfig((p) => ({ ...p, service: svc.key }))
                    }
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      apiConfig.service === svc.key
                        ? "border-teal-500 bg-teal-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-800">
                        {svc.name}
                      </p>
                      {apiConfig.service === svc.key && (
                        <span className="text-teal-600 font-bold text-xs">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{svc.note}</p>
                    <p className="text-xs font-mono text-slate-400 mt-1">
                      {svc.endpoint}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Credentials */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-slate-700 text-white flex items-center gap-2">
                <span className="text-base">{"\u{1F511}"}</span>
                <span className="text-sm font-bold tracking-wide">
                  DEFAULTS & CREDENTIALS
                </span>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className={labelClass}>
                    API Key (stored server-side via env)
                  </label>
                  <input
                    type="password"
                    placeholder="SINCH_KEY_ID / SINCH_KEY_SECRET configured in .env"
                    disabled
                    className={`${monoInputClass} bg-slate-50 cursor-not-allowed`}
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    API keys are managed via environment variables for security.
                    Set SINCH_KEY_ID and SINCH_KEY_SECRET in your .env file.
                  </p>
                </div>
                <div>
                  <label className={labelClass}>Default Sender Name</label>
                  <input
                    type="text"
                    value={apiConfig.defaultSender}
                    onChange={(e) =>
                      setApiConfig((p) => ({
                        ...p,
                        defaultSender: e.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Default Facility</label>
                  <input
                    type="text"
                    value={apiConfig.defaultFacility}
                    onChange={(e) =>
                      setApiConfig((p) => ({
                        ...p,
                        defaultFacility: e.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </div>
                <button
                  onClick={handleSaveConfig}
                  className={`px-6 py-2.5 text-xs font-bold rounded-lg transition-colors ${
                    configSaved
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-800 text-white hover:bg-slate-900"
                  }`}
                >
                  {configSaved
                    ? "\u2713 CONFIGURATION SAVED"
                    : "SAVE CONFIGURATION"}
                </button>
              </div>
            </div>

            {/* System Info */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-violet-700 text-white flex items-center gap-2">
                <span className="text-base">{"\u{1F4BB}"}</span>
                <span className="text-sm font-bold tracking-wide">
                  SYSTEM INFO
                </span>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-slate-400 font-bold uppercase text-[10px]">
                      OCR Engine
                    </p>
                    <p className="font-semibold text-slate-700">
                      Tesseract.js v5 (client) + Intake API (server)
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-slate-400 font-bold uppercase text-[10px]">
                      Fax API
                    </p>
                    <p className="font-semibold text-slate-700">
                      Sinch Fax API v3
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-slate-400 font-bold uppercase text-[10px]">
                      Encryption
                    </p>
                    <p className="font-semibold text-slate-700">
                      TLS 1.3 + AES-256 at rest
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-slate-400 font-bold uppercase text-[10px]">
                      Compliance
                    </p>
                    <p className="font-semibold text-slate-700">
                      HIPAA / 45 CFR \u00A7164
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-slate-400 font-bold uppercase text-[10px]">
                      Audit Trail
                    </p>
                    <p className="font-semibold text-slate-700">
                      Full sender/recipient/timestamp logging
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-slate-400 font-bold uppercase text-[10px]">
                      Logged in as
                    </p>
                    <p className="font-semibold text-slate-700 truncate">
                      {session?.user?.email || "N/A"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-200 bg-white mt-8">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between text-xs text-slate-400">
          <span>
            \u00A9 {new Date().getFullYear()} Adams Stryker SFM \u00B7
            StrykeFox Medical Platform
          </span>
          <span>HIPAA \u00B7 45 CFR \u00A7164 \u00B7 BAA Required</span>
        </div>
      </div>
    </div>
  );
}
