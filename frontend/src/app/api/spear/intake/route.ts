import { NextResponse } from 'next/server';
import { parseUnpdf } from '@/lib/ocr/unpdf';
import { parseTesseract } from '@/lib/ocr/tesseract';
import { parseTextract } from '@/lib/ocr/textract';
import { extractStructuredFieldsFromText } from '@/lib/intake-extraction';
import { appendWorkflowEvent, attachDocumentToCase, createCaseFromIntake, saveDocument, saveTridentReview, updateCase } from '@/lib/poseidon-store';
import { isSpearApiAuthFailure, requireSpearApiAuth } from '@/lib/spear-auth';
import { getMasterData, normalizePayer, normalizeProviderFacility, recommendConfiguredKit } from '@/lib/spear-master-data';

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return "";
}

function codes(text: string, pattern: RegExp) {
  return Array.from(new Set(Array.from(text.matchAll(pattern), (match) => match[0].toUpperCase().replace(/\.$/, "")))).slice(0, 10);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parseExtractedText(text: string): Record<string, unknown> {
  const structured = extractStructuredFieldsFromText(text);
  const patientName = structured.patientName;
  return {
    patient_name: patientName,
    first_name: structured.firstName,
    last_name: structured.lastName,
    dob: firstMatch(text, [
      /\bDOB\s*[:#-]\s*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i,
      /date\s*of\s*birth\s*[:#-]\s*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i,
    ]),
    patient_id: structured.patientId,
    mrn: structured.mrn,
    payer: structured.payer,
    member_id: firstMatch(text, [
      /member\s*(?:id|#)\s*[:#-]\s*([A-Z0-9-]{4,30})/i,
      /subscriber\s*(?:id|#)\s*[:#-]\s*([A-Z0-9-]{4,30})/i,
    ]),
    provider: firstMatch(text, [
      /(?:ordering|referring|provider|physician)\s*(?:name)?\s*[:#-]\s*([A-Z][A-Z ,.'-]{2,80})/i,
    ]),
    facility_name_raw: firstMatch(text, [
      /(?:facility|practice|clinic)\s*(?:name)?\s*[:#-]\s*([A-Z][A-Z0-9 &.'-]{2,90})/i,
      /\b(Las Vegas Concierge Orthop(?:a)?edics|LVCO|Concierge Orthop(?:a)?edics)\b/i,
    ]),
    npi: firstMatch(text, [/\bNPI\s*[:#-]?\s*(\d{10})\b/i, /provider[^0-9]{0,24}(\d{10})\b/i]),
    hcpcs: codes(text, /\b[A-Z][0-9]{4}\b/g),
    icd: codes(text, /\b[A-TV-Z][0-9][0-9AB]\.?[0-9A-Z]{0,4}\b/g),
  };
}

export async function POST(req: Request) {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;

  const contentType = req.headers.get("content-type") || "";
  let payload: Record<string, unknown> = {};
  let parsedFieldsPresent = false;

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    for (const [key, value] of Array.from(formData.entries())) {
      if (key === "payload" && typeof value === "string") {
        payload = { ...payload, ...JSON.parse(value || "{}") };
      } else if (key !== "file" && typeof value === "string") {
        payload[key] = value;
      }
    }

    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      let result = { text: "", confidence: 0, missingFields: ["OCR"] };
      let parserWarning = "";
      try {
        result = await withTimeout(parseUnpdf(file), 8000, "Digital PDF extraction");
        if (result.confidence < 0.6) {
          result = await withTimeout(parseTesseract(file), 15000, "OCR extraction");
        }
        const needsHandwritingFallback = result.confidence < 0.4 || result.missingFields.some((field) => field !== "HCPCS");
        if (needsHandwritingFallback) {
          result = await withTimeout(parseTextract(file), 10000, "Textract extraction");
        }
      } catch (error) {
        parserWarning = error instanceof Error ? error.message : "Document extraction failed.";
      }
      payload = {
        ...payload,
        ...Object.fromEntries(Object.entries(parseExtractedText(result.text)).filter(([, value]) => {
          if (Array.isArray(value)) return value.length > 0;
          return Boolean(String(value || "").trim());
        })),
        source: "spear_intake_ocr",
        raw_text: result.text,
        parser_confidence: result.confidence,
        missing_parser_fields: parserWarning ? [...result.missingFields, parserWarning] : result.missingFields,
        parser_warning: parserWarning,
      };
      parsedFieldsPresent = Boolean(result.text);
      payload.__uploaded_file = {
        filename: file.name || "source-document.pdf",
        content_type: file.type || "application/pdf",
        buffer,
      };
    }
  } else {
    payload = await req.json().catch(() => ({}));
    parsedFieldsPresent = Boolean(payload.raw_text || payload.parsed || payload.parser_confidence);
  }

  const masterData = await getMasterData();
  const payerMatch = normalizePayer(String(payload.payer || payload.payer_id || ""), masterData);
  const providerFacilityMatch = normalizeProviderFacility({
    facility_name_raw: String(payload.facility_name_raw || payload.facility_name || payload.facility || ""),
    provider_name_raw: String(payload.provider || payload.provider_name || ""),
    provider_npi_raw: String(payload.npi || payload.referring_npi || payload.provider_npi || ""),
  }, masterData);
  if (payerMatch.canonical_payer_id) {
    payload.raw_payer = payload.payer || payload.payer_id;
    payload.payer = payerMatch.canonical_name;
    payload.payer_id = payerMatch.canonical_payer_id;
    payload.canonical_payer = payerMatch.canonical_name;
    payload.canonical_payer_id = payerMatch.canonical_payer_id;
    payload.payer_match_status = payerMatch.match_status;
    payload.payer_match_confidence = payerMatch.confidence;
    payload.payer_normalization = payerMatch;
  } else {
    payload.raw_payer = payload.raw_payer || payload.payer || payload.payer_id;
    payload.canonical_payer = payload.canonical_payer || "";
    payload.payer_match_status = payerMatch.match_status;
    payload.payer_match_confidence = payerMatch.confidence;
    payload.payer_normalization = payerMatch;
  }
  if (providerFacilityMatch.facility.facility_id) {
    payload.facility_id = providerFacilityMatch.facility.facility_id;
    payload.facility = providerFacilityMatch.facility.canonical_name;
    payload.facility_match = providerFacilityMatch.facility;
  }
  if (providerFacilityMatch.provider.provider_id) {
    payload.provider_id = providerFacilityMatch.provider.provider_id;
    payload.provider = providerFacilityMatch.provider.display_name;
    payload.provider_name = providerFacilityMatch.provider.display_name;
    payload.npi = providerFacilityMatch.provider.npi || payload.npi || payload.referring_npi || "";
    payload.provider_match = providerFacilityMatch.provider;
    payload.npi_source = providerFacilityMatch.provider.npi ? "provider_registry" : "missing_from_provider_registry";
    if (providerFacilityMatch.provider.setup_status === "npi_required") {
      payload.provider_registry_status = "npi_required";
      payload.provider_registry_incomplete = true;
    }
  }

  const requiredMissing = [
    ["patient_name", payload.patient_name],
    ["dob", payload.dob],
    ["payer", payload.payer || payload.payer_id],
    ["member_id", payload.member_id || payload.insurance_id],
    ["provider_name", payload.provider || payload.provider_name],
  ].filter(([, value]) => !String(value || "").trim()).map(([name]) => name);
  const hasSourceHcpcs = Array.isArray(payload.hcpcs)
    ? payload.hcpcs.length > 0
    : Boolean(String(payload.hcpcs || payload.hcpcs_codes || "").trim());
  const orderContext = hasSourceHcpcs || Boolean(String(payload.product || payload.order_type || "").trim());
  if (!orderContext) requiredMissing.push("order_context");
  if (requiredMissing.length && !payload.override_reason) {
    return NextResponse.json({
      ok: false,
      error: "Required intake fields are missing.",
      missing_fields: requiredMissing,
      next_action: "Review extracted values, correct missing fields, or record a privileged override reason if authorized.",
    }, { status: 422 });
  }

  const uploaded = payload.__uploaded_file as { filename: string; content_type: string; buffer: Buffer } | undefined;
  const pendingDocumentId = String(payload.source_document_id || payload.document_id || "").trim();
  delete payload.__uploaded_file;
  payload.source_hcpcs = payload.source_hcpcs || payload.hcpcs || payload.hcpcs_codes || [];
  payload.source_icd = payload.source_icd || payload.icd || payload.icd10 || payload.icd10_codes || [];
  payload.hcpcs_status = "pending_trident";
  payload.coding_status = "pending_trident";
  payload.status = "trident_review";
  let record = await createCaseFromIntake(payload);
  const intakeStatus = record.missing_fields?.length ? "missing_docs" : "trident_review";
  if (record.status !== intakeStatus) {
    record = await updateCase(record.id, {
      status: intakeStatus,
      trident_status: intakeStatus === "trident_review" ? "ready" : record.trident_status,
    }) || record;
  }
  await appendWorkflowEvent(record.id, "intake_received", { source: payload.source, document_id: pendingDocumentId || undefined });
  if (uploaded?.buffer) {
    const document = await saveDocument({
      case_id: record.id,
      kind: "source_intake",
      filename: uploaded.filename,
      content_type: uploaded.content_type,
      content: uploaded.buffer,
    });
    await updateCase(record.id, {
      document_ids: [document.id],
      source_document_id: document.id,
    });
  }
  if (pendingDocumentId) {
    const document = await attachDocumentToCase(pendingDocumentId, record.id);
    if (!document) {
      if (uploaded?.buffer) {
        const fallbackDocument = await saveDocument({
          case_id: record.id,
          kind: "source_intake",
          filename: uploaded.filename,
          content_type: uploaded.content_type,
          content: uploaded.buffer,
        });
        await updateCase(record.id, {
          document_ids: [fallbackDocument.id],
          source_document_id: fallbackDocument.id,
          extraction_result: payload.extraction_result || null,
          operator_corrections: payload.operator_corrections || [],
        });
        await appendWorkflowEvent(record.id, "source_document_attach_fallback", {
          pending_document_id: pendingDocumentId,
          document_id: fallbackDocument.id,
        });
      } else {
        await appendWorkflowEvent(record.id, "source_document_attach_failed", { document_id: pendingDocumentId });
        return NextResponse.json({
          ok: false,
          error: "Case created, but the stored source document could not be attached.",
          case_id: record.id,
          order_id: record.order_id,
          next_action: "Open the case workspace and re-upload the source document before Trident review.",
        }, { status: 500 });
      }
    } else {
      await updateCase(record.id, {
        document_ids: [document.id],
        source_document_id: document.id,
        extraction_result: payload.extraction_result || null,
        operator_corrections: payload.operator_corrections || [],
      });
    }
  }
  if (parsedFieldsPresent) {
    await appendWorkflowEvent(record.id, "extraction_complete", {
      parser_confidence: payload.parser_confidence,
      source: payload.source,
    });
  }
  if (payload.reviewed_fields) {
    await appendWorkflowEvent(record.id, "extraction_reviewed", {
      fields: payload.reviewed_fields,
      operator_corrections: payload.operator_corrections || [],
    });
  }
  if (payload.patient_match_decision) {
    await appendWorkflowEvent(record.id, "patient_match_reviewed", {
      decision: payload.patient_match_decision,
      matched_case_id: payload.matched_case_id,
      patient_name: payload.patient_name,
      dob: payload.dob,
      payer: payload.payer || payload.payer_id,
      member_id: payload.member_id || payload.insurance_id,
    });
  }
  await appendWorkflowEvent(record.id, "payer_normalized", payerMatch);
  if (payerMatch.match_status === "unmatched") {
    await appendWorkflowEvent(record.id, "payer_match_corrected", {
      raw_value: payerMatch.raw_value,
      next_action: "Select an existing payer or add a payer alias in Settings.",
    });
  } else {
    await appendWorkflowEvent(record.id, "payer_match_confirmed", payerMatch);
  }
  if (providerFacilityMatch.facility.facility_id) await appendWorkflowEvent(record.id, "facility_matched", providerFacilityMatch.facility);
  if (providerFacilityMatch.provider.provider_id) await appendWorkflowEvent(record.id, "provider_matched", providerFacilityMatch.provider);
  if (providerFacilityMatch.provider.setup_status === "npi_required") {
    await appendWorkflowEvent(record.id, "provider_registry_incomplete", {
      provider: providerFacilityMatch.provider.display_name,
      facility: providerFacilityMatch.facility.canonical_name,
      missing: "npi",
    });
  }
  if (payload.override_reason) {
    await appendWorkflowEvent(record.id, "manual_intake_selected", {
      reason: payload.override_reason,
      operator: payload.operator_identity || "spear_operator",
    });
  }
  await appendWorkflowEvent(record.id, "patient_created", { patient_name: record.patient_name });
  await appendWorkflowEvent(record.id, "case_created", { case_id: record.id });
  await appendWorkflowEvent(record.id, "order_created", { order_id: record.order_id });
  await appendWorkflowEvent(record.id, "intake_completed", {
    status: record.status,
    missing_fields: record.missing_fields,
  });

  await appendWorkflowEvent(record.id, "trident_auto_started", { source: "intake" });
  const recommendation = recommendConfiguredKit(record, masterData);
  const recommendedHcpcs = recommendation.hcpcsComponents.map((item) => String(item.code || item.hcpcs || "")).filter(Boolean);
  const sourceHcpcs = Array.isArray(record.source_hcpcs) ? record.source_hcpcs : [];
  const conflicts = sourceHcpcs.length
    ? sourceHcpcs.filter((code) => !recommendedHcpcs.includes(String(code)))
    : [];
  const review = {
    case_id: record.id,
    recommended_carepath: recommendation.carepath ? { id: recommendation.carepath.id, name: recommendation.carepath.name } : null,
    recommended_kit: recommendation.kit ? { id: recommendation.kit.id, name: recommendation.kit.name } : null,
    recommended_hcpcs: recommendation.hcpcsComponents.map((item) => ({
      code: item.code || item.hcpcs,
      description: item.description,
      quantity: item.quantity,
      modifier: item.modifier,
      rationale: "Configured kit recommendation from Trident master data.",
      confidence: 0.82,
    })),
    source_hcpcs: sourceHcpcs,
    coding_conflicts: conflicts,
    missing_inputs: record.missing_fields,
    review_status: conflicts.length || record.missing_fields.length ? "review" : "pass",
    recommendations: conflicts.length
      ? ["Review source HCPCS conflict against configured kit before packet generation."]
      : ["Review and approve Trident kit recommendation before provider packet generation."],
  };
  await saveTridentReview(record.id, review);
  record = await updateCase(record.id, {
    carepath_id: String(recommendation.carepath?.id || ""),
    carepath_name: String(recommendation.carepath?.name || ""),
    recommended_kit_id: String(recommendation.kit?.id || ""),
    recommended_kit_name: String(recommendation.kit?.name || ""),
    trident_recommended_hcpcs: recommendedHcpcs,
    trident_recommended_icd: Array.isArray(record.source_icd) ? record.source_icd : [],
    trident_status: review.review_status,
    coding_status: "trident_recommended",
    status: "trident_review_complete",
  }) || record;
  await appendWorkflowEvent(record.id, "trident_auto_completed", review);
  await appendWorkflowEvent(record.id, "carepath_recommended", review.recommended_carepath);
  await appendWorkflowEvent(record.id, "kit_recommended", review.recommended_kit);
  await appendWorkflowEvent(record.id, "coding_recommended", { recommended_hcpcs: recommendedHcpcs, conflicts });

  return NextResponse.json({
    ok: true,
    patient_id: `pat_${record.id.replace(/^case_/, "").slice(0, 12)}`,
    case_id: record.id,
    order_id: record.order_id,
    status: record.status,
    destination: `/spear/cases/${record.id}`,
    case: record,
  }, { status: 201 });
}
