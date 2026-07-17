import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type SpearCaseStatus =
  | "intake_received"
  | "created"
  | "missing_docs"
  | "trident_review"
  | "trident_review_complete"
  | "provider_packet_generated"
  | "provider_signature_requested"
  | "signed_swo_received"
  | "billing_packet_generated"
  | "ready_to_fulfill"
  | "pod_needed"
  | "pod_generated"
  | "delivery_recorded"
  | "signed_pod_received"
  | "revenue_support"
  | "tebra_ready"
  | "staged_for_upload"
  | "ready_to_bill"
  | "blocked_missing_fields"
  | "closed";

export type SpearCase = {
  id: string;
  order_id: string;
  patient_name: string;
  dob: string;
  payer: string;
  member_id: string;
  provider: string;
  npi: string;
  hcpcs: string[];
  icd: string[];
  source_hcpcs?: string[];
  trident_recommended_hcpcs?: string[];
  operator_approved_hcpcs?: string[];
  final_hcpcs?: string[];
  source_icd?: string[];
  trident_recommended_icd?: string[];
  operator_approved_icd?: string[];
  final_icd?: string[];
  hcpcs_status?: string;
  coding_status?: string;
  product: string;
  laterality: string;
  order_date: string;
  status: SpearCaseStatus;
  billing_status: string;
  trident_status: string;
  pod_status: string;
  tebra_status: string;
  missing_fields: string[];
  high_risk_flags: string[];
  created_at: string;
  updated_at: string;
  source: string;
  [key: string]: unknown;
};

type WorkflowEvent = {
  id: string;
  case_id: string;
  event_type: string;
  payload: unknown;
  created_at: string;
};

type TridentReview = {
  id: string;
  case_id: string;
  created_at: string;
  review: unknown;
};

type TrainingEvent = {
  id: string;
  created_at: string;
  payload: Record<string, unknown>;
};

export type StoredDocument = {
  id: string;
  case_id: string;
  kind: string;
  filename: string;
  content_type: string;
  size: number;
  content_base64: string;
  created_at: string;
};

export type StoredArtifact = {
  id: string;
  case_id: string;
  kind: string;
  filename: string;
  content_type: string;
  size: number;
  content_base64: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type SpearMasterData = {
  payers: Array<Record<string, unknown>>;
  providers: Array<Record<string, unknown>>;
  facilities: Array<Record<string, unknown>>;
  carepaths: Array<Record<string, unknown>>;
  kits: Array<Record<string, unknown>>;
  code_sets: Array<Record<string, unknown>>;
  unmatched_payers: Array<Record<string, unknown>>;
};

const STORE_DIR = path.join(process.cwd(), ".local", "spear");
const CASES_PATH = path.join(STORE_DIR, "cases.json");
const EVENTS_PATH = path.join(STORE_DIR, "events.json");
const REVIEWS_PATH = path.join(STORE_DIR, "trident-reviews.json");
const TRAINING_PATH = path.join(STORE_DIR, "training-events.json");
const AGGREGATES_PATH = path.join(STORE_DIR, "trident-aggregates.json");
const DOCUMENTS_PATH = path.join(STORE_DIR, "documents.json");
const ARTIFACTS_PATH = path.join(STORE_DIR, "artifacts.json");
const MASTER_DATA_PATH = path.join(STORE_DIR, "master-data.json");
const GIST_FILENAME = process.env.SPEAR_STORE_GIST_FILENAME || "spear-store.json";
const GIST_RAW_OWNER = process.env.SPEAR_STORE_GIST_OWNER || "Stryke3";

type SpearStore = {
  cases: SpearCase[];
  events: WorkflowEvent[];
  trident_reviews: TridentReview[];
  training_events: TrainingEvent[];
  trident_aggregates: Record<string, TrainingAggregate>;
  documents: StoredDocument[];
  artifacts: StoredArtifact[];
  master_data: SpearMasterData;
};

type TrainingAggregate = {
  count: number;
  denials: number;
  paid: number;
  allowed_total: number;
  paid_total: number;
};

function hasRemoteStore() {
  return Boolean(process.env.SPEAR_STORE_GIST_ID && process.env.SPEAR_GITHUB_TOKEN);
}

function emptyStore(): SpearStore {
  return {
    cases: [],
    events: [],
    trident_reviews: [],
    training_events: [],
    trident_aggregates: {},
    documents: [],
    artifacts: [],
    master_data: emptyMasterData(),
  };
}

function emptyMasterData(): SpearMasterData {
  return {
    payers: [],
    providers: [],
    facilities: [],
    carepaths: [],
    kits: [],
    code_sets: [],
    unmatched_payers: [],
  };
}

async function readRemoteStore(): Promise<SpearStore> {
  const gistId = process.env.SPEAR_STORE_GIST_ID;
  const token = process.env.SPEAR_GITHUB_TOKEN;
  if (!gistId || !token) return emptyStore();

  async function readRawFallback(): Promise<SpearStore | null> {
    const rawResponse = await fetch(`https://gist.githubusercontent.com/${GIST_RAW_OWNER}/${gistId}/raw/${GIST_FILENAME}`, {
      cache: "no-store",
    }).catch(() => null);
    if (!rawResponse?.ok) return null;
    return { ...emptyStore(), ...JSON.parse(await rawResponse.text()) };
  }

  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const raw = await readRawFallback();
    if (raw) return raw;
    throw new Error(`SPEAR store read failed: GitHub returned ${response.status}`);
  }

  const gist = await response.json();
  const content = gist?.files?.[GIST_FILENAME]?.content;
  if (!content || typeof content !== "string") return emptyStore();
  try {
    return { ...emptyStore(), ...JSON.parse(content) };
  } catch (error) {
    const raw = await readRawFallback();
    if (raw) return raw;
    throw error;
  }
}

async function writeRemoteStore(store: SpearStore) {
  const gistId = process.env.SPEAR_STORE_GIST_ID;
  const token = process.env.SPEAR_GITHUB_TOKEN;
  if (!gistId || !token) return;

  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: {
          content: `${JSON.stringify(store, null, 2)}\n`,
        },
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`SPEAR store write failed: GitHub returned ${response.status}`);
  }
}

async function ensureStore() {
  await fs.mkdir(STORE_DIR, { recursive: true });
  await ensureArrayFile(CASES_PATH);
  await ensureArrayFile(EVENTS_PATH);
  await ensureArrayFile(REVIEWS_PATH);
  await ensureArrayFile(TRAINING_PATH);
  await ensureArrayFile(DOCUMENTS_PATH);
  await ensureArrayFile(ARTIFACTS_PATH);
  try {
    await fs.access(MASTER_DATA_PATH);
  } catch {
    await fs.writeFile(MASTER_DATA_PATH, `${JSON.stringify(emptyMasterData(), null, 2)}\n`, "utf8");
  }
  try {
    await fs.access(AGGREGATES_PATH);
  } catch {
    await fs.writeFile(AGGREGATES_PATH, "{}\n", "utf8");
  }
}

async function ensureArrayFile(filePath: string) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, "[]\n", "utf8");
  }
}

async function readArray<T>(filePath: string): Promise<T[]> {
  if (hasRemoteStore()) {
    const store = await readRemoteStore();
    if (filePath === CASES_PATH) return store.cases as T[];
    if (filePath === EVENTS_PATH) return store.events as T[];
    if (filePath === REVIEWS_PATH) return store.trident_reviews as T[];
    if (filePath === TRAINING_PATH) return store.training_events as T[];
    if (filePath === DOCUMENTS_PATH) return store.documents as T[];
    if (filePath === ARTIFACTS_PATH) return store.artifacts as T[];
    return [];
  }

  await ensureStore();
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw || "[]");
  return Array.isArray(parsed) ? parsed : [];
}

async function writeArray<T>(filePath: string, records: T[]) {
  if (hasRemoteStore()) {
    const store = await readRemoteStore();
    if (filePath === CASES_PATH) store.cases = records as SpearCase[];
    if (filePath === EVENTS_PATH) store.events = records as WorkflowEvent[];
    if (filePath === REVIEWS_PATH) store.trident_reviews = records as TridentReview[];
    if (filePath === TRAINING_PATH) store.training_events = records as TrainingEvent[];
    if (filePath === DOCUMENTS_PATH) store.documents = records as StoredDocument[];
    if (filePath === ARTIFACTS_PATH) store.artifacts = records as StoredArtifact[];
    await writeRemoteStore(store);
    return;
  }

  await ensureStore();
  await fs.writeFile(filePath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
}

export async function readMasterData(): Promise<SpearMasterData> {
  if (hasRemoteStore()) {
    const store = await readRemoteStore();
    return { ...emptyMasterData(), ...(store.master_data || {}) };
  }
  await ensureStore();
  const raw = await fs.readFile(MASTER_DATA_PATH, "utf8");
  return { ...emptyMasterData(), ...JSON.parse(raw || "{}") };
}

export async function writeMasterData(masterData: SpearMasterData): Promise<SpearMasterData> {
  const next = { ...emptyMasterData(), ...masterData };
  if (hasRemoteStore()) {
    const store = await readRemoteStore();
    store.master_data = next;
    await writeRemoteStore(store);
    return next;
  }
  await ensureStore();
  await fs.writeFile(MASTER_DATA_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

function listField(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") {
    return value.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function textField(payload: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function missingFieldsFor(payload: Partial<SpearCase>) {
  const required: Array<keyof SpearCase> = [
    "patient_name",
    "dob",
    "payer",
    "member_id",
    "provider",
    "laterality",
    "order_date",
  ];
  const missing = required.filter((key) => !String(payload[key] || "").trim()).map(String);
  if ((payload.provider_registry_status === "npi_required" || payload.provider_registry_incomplete === true) && !String(payload.npi || "").trim()) {
    missing.push("provider_npi_setup");
  }
  return missing;
}

export async function listCases(): Promise<SpearCase[]> {
  const records = await readArray<SpearCase>(CASES_PATH);
  if (records.length === 0 && process.env.POSEIDON_SEED_DEMO === "true") {
    return [
      normalizeCase({
        patient_name: "Demo Patient",
        dob: "1975-01-01",
        payer: "Synthetic Commercial",
        member_id: "DEMO123",
        provider: "Dr. Demo",
        npi: "1234567890",
        hcpcs: ["L1833"],
        icd: ["M17.11"],
        laterality: "Right",
        order_date: "2026-05-19",
        source: "demo",
      }),
    ];
  }
  return records;
}

export async function getCase(caseId: string): Promise<SpearCase | null> {
  const records = await listCases();
  return records.find((record) => record.id === caseId || record.order_id === caseId) ?? null;
}

export async function saveDocument(input: {
  case_id: string;
  kind: string;
  filename: string;
  content_type: string;
  content: Buffer;
}): Promise<StoredDocument> {
  const records = await readArray<StoredDocument>(DOCUMENTS_PATH);
  const document = {
    id: `doc_${randomUUID()}`,
    case_id: input.case_id,
    kind: input.kind,
    filename: input.filename,
    content_type: input.content_type,
    size: input.content.length,
    content_base64: input.content.toString("base64"),
    created_at: new Date().toISOString(),
  };
  records.push(document);
  await writeArray(DOCUMENTS_PATH, records);
  await appendWorkflowEvent(input.case_id, "document_stored", {
    document_id: document.id,
    kind: document.kind,
    filename: document.filename,
    size: document.size,
  });
  return document;
}

export async function savePendingIntakeDocument(input: {
  filename: string;
  content_type: string;
  content: Buffer;
  metadata?: Record<string, unknown>;
}): Promise<StoredDocument> {
  const records = await readArray<StoredDocument>(DOCUMENTS_PATH);
  const document = {
    id: `doc_${randomUUID()}`,
    case_id: `pending_${randomUUID()}`,
    kind: "source_intake",
    filename: input.filename,
    content_type: input.content_type,
    size: input.content.length,
    content_base64: input.content.toString("base64"),
    created_at: new Date().toISOString(),
    storage_status: "stored",
    metadata: input.metadata || {},
  };
  records.push(document);
  await writeArray(DOCUMENTS_PATH, records);
  return document;
}

export async function attachDocumentToCase(documentId: string, caseId: string): Promise<StoredDocument | null> {
  const records = await readArray<StoredDocument>(DOCUMENTS_PATH);
  const index = records.findIndex((record) => record.id === documentId);
  if (index === -1) return null;
  const document = {
    ...records[index],
    case_id: caseId,
    attached_at: new Date().toISOString(),
  };
  records[index] = document;
  await writeArray(DOCUMENTS_PATH, records);
  await appendWorkflowEvent(caseId, "source_document_attached", {
    document_id: document.id,
    filename: document.filename,
    size: document.size,
  });
  return document;
}

export async function listDocuments(caseId?: string): Promise<StoredDocument[]> {
  const records = await readArray<StoredDocument>(DOCUMENTS_PATH);
  return caseId ? records.filter((record) => record.case_id === caseId) : records;
}

export async function getDocument(documentId: string): Promise<StoredDocument | null> {
  const records = await listDocuments();
  return records.find((record) => record.id === documentId) ?? null;
}

export async function saveArtifact(input: {
  case_id: string;
  kind: string;
  filename: string;
  content_type: string;
  content: Buffer;
  metadata?: Record<string, unknown>;
}): Promise<StoredArtifact> {
  const records = await readArray<StoredArtifact>(ARTIFACTS_PATH);
  const artifact = {
    id: `art_${randomUUID()}`,
    case_id: input.case_id,
    kind: input.kind,
    filename: input.filename,
    content_type: input.content_type,
    size: input.content.length,
    content_base64: input.content.toString("base64"),
    metadata: input.metadata || {},
    created_at: new Date().toISOString(),
  };
  records.push(artifact);
  await writeArray(ARTIFACTS_PATH, records);
  await appendWorkflowEvent(input.case_id, "artifact_generated", {
    artifact_id: artifact.id,
    kind: artifact.kind,
    filename: artifact.filename,
    size: artifact.size,
  });
  return artifact;
}

export async function saveArtifacts(inputs: Array<{
  case_id: string;
  kind: string;
  filename: string;
  content_type: string;
  content: Buffer;
  metadata?: Record<string, unknown>;
}>): Promise<StoredArtifact[]> {
  if (inputs.length === 0) return [];
  const records = await readArray<StoredArtifact>(ARTIFACTS_PATH);
  const createdAt = new Date().toISOString();
  const artifacts = inputs.map((input) => ({
    id: `art_${randomUUID()}`,
    case_id: input.case_id,
    kind: input.kind,
    filename: input.filename,
    content_type: input.content_type,
    size: input.content.length,
    content_base64: input.content.toString("base64"),
    metadata: input.metadata || {},
    created_at: createdAt,
  }));
  records.push(...artifacts);
  await writeArray(ARTIFACTS_PATH, records);
  await appendWorkflowEvent(inputs[0].case_id, "artifacts_generated", {
    artifact_ids: artifacts.map((artifact) => artifact.id),
    kinds: artifacts.map((artifact) => artifact.kind),
  });
  return artifacts;
}

export async function listArtifacts(caseId?: string): Promise<StoredArtifact[]> {
  const records = await readArray<StoredArtifact>(ARTIFACTS_PATH);
  return caseId ? records.filter((record) => record.case_id === caseId) : records;
}

export async function getArtifact(artifactId: string): Promise<StoredArtifact | null> {
  const records = await listArtifacts();
  return records.find((record) => record.id === artifactId) ?? null;
}

export async function createCaseFromIntake(payload: Record<string, unknown>): Promise<SpearCase> {
  const record = normalizeCase(payload);
  const records = await readArray<SpearCase>(CASES_PATH);
  records.unshift(record);
  await writeArray(CASES_PATH, records);
  await appendWorkflowEvent(record.id, "case_created", { order_id: record.order_id, status: record.status });
  return record;
}

function normalizeCase(payload: Record<string, unknown>): SpearCase {
  const now = new Date().toISOString();
  const sourceHcpcs = listField(payload.source_hcpcs || payload.hcpcs || payload.hcpcs_codes);
  const tridentHcpcs = listField(payload.trident_recommended_hcpcs);
  const approvedHcpcs = listField(payload.operator_approved_hcpcs);
  const finalHcpcs = listField(payload.final_hcpcs || payload.operator_approved_hcpcs || payload.trident_recommended_hcpcs);
  const sourceIcd = listField(payload.source_icd || payload.icd || payload.icd10 || payload.icd10_codes || payload.diagnosis_codes);
  const tridentIcd = listField(payload.trident_recommended_icd);
  const approvedIcd = listField(payload.operator_approved_icd);
  const finalIcd = listField(payload.final_icd || payload.operator_approved_icd || payload.trident_recommended_icd || payload.icd || payload.icd10 || payload.icd10_codes || payload.diagnosis_codes);
  const hcpcs = finalHcpcs.length ? finalHcpcs : sourceHcpcs;
  const icd = finalIcd.length ? finalIcd : sourceIcd;
  const codingPending = !finalHcpcs.length;
  const base: Partial<SpearCase> = {
    id: textField(payload, "id", "case_id") || `case_${randomUUID()}`,
    order_id: textField(payload, "order_id") || `ord_${randomUUID()}`,
    patient_name: textField(payload, "patient_name", "patient"),
    dob: textField(payload, "dob", "date_of_birth"),
    payer: textField(payload, "payer", "payer_name", "payer_id"),
    member_id: textField(payload, "member_id", "insurance_id", "insuranceId"),
    provider: textField(payload, "provider", "provider_name", "physician", "referring_provider"),
    npi: textField(payload, "npi", "referring_npi", "physician_npi"),
    hcpcs,
    icd,
    source_hcpcs: sourceHcpcs,
    trident_recommended_hcpcs: tridentHcpcs,
    operator_approved_hcpcs: approvedHcpcs,
    final_hcpcs: finalHcpcs,
    source_icd: sourceIcd,
    trident_recommended_icd: tridentIcd,
    operator_approved_icd: approvedIcd,
    final_icd: finalIcd,
    hcpcs_status: textField(payload, "hcpcs_status") || (codingPending ? "pending_trident" : "available"),
    coding_status: textField(payload, "coding_status") || (codingPending ? "pending_trident" : "source_extracted"),
    product: textField(payload, "product", "order_type") || (sourceHcpcs[0] ? `Source HCPCS ${sourceHcpcs[0]}` : ""),
    laterality: textField(payload, "laterality"),
    order_date: textField(payload, "order_date", "date_of_service"),
    billing_status: textField(payload, "billing_status") || "not_ready",
    trident_status: textField(payload, "trident_status") || "pending",
    pod_status: textField(payload, "pod_status") || "not_started",
    tebra_status: textField(payload, "tebra_status") || "not_staged",
    high_risk_flags: listField(payload.high_risk_flags),
    created_at: textField(payload, "created_at") || now,
    updated_at: now,
    source: textField(payload, "source") || "spear_intake",
  };
  const missing = missingFieldsFor(base);
  return {
    ...(base as SpearCase),
    missing_fields: missing,
    status: (textField(payload, "status") || (missing.length ? "missing_docs" : codingPending ? "trident_review" : "created")) as SpearCaseStatus,
  };
}

export async function updateCase(caseId: string, patch: Partial<SpearCase>): Promise<SpearCase | null> {
  const records = await readArray<SpearCase>(CASES_PATH);
  const index = records.findIndex((record) => record.id === caseId || record.order_id === caseId);
  if (index === -1) return null;
  const updated = {
    ...records[index],
    ...patch,
    updated_at: new Date().toISOString(),
  };
  records[index] = updated;
  await writeArray(CASES_PATH, records);
  return updated;
}

export async function appendWorkflowEvent(caseId: string, eventType: string, payload: unknown): Promise<WorkflowEvent> {
  const events = await readArray<WorkflowEvent>(EVENTS_PATH);
  const event = {
    id: `evt_${randomUUID()}`,
    case_id: caseId,
    event_type: eventType,
    payload,
    created_at: new Date().toISOString(),
  };
  events.push(event);
  await writeArray(EVENTS_PATH, events);
  return event;
}

export async function listWorkflowEvents(caseId?: string): Promise<WorkflowEvent[]> {
  const events = await readArray<WorkflowEvent>(EVENTS_PATH);
  return caseId ? events.filter((event) => event.case_id === caseId) : events;
}

export async function saveTridentReview(caseId: string, review: unknown): Promise<TridentReview> {
  const reviews = await readArray<TridentReview>(REVIEWS_PATH);
  const stored = {
    id: `tri_${randomUUID()}`,
    case_id: caseId,
    created_at: new Date().toISOString(),
    review,
  };
  reviews.push(stored);
  await writeArray(REVIEWS_PATH, reviews);
  await appendWorkflowEvent(caseId, "trident_review_stored", review);
  return stored;
}

export async function listTridentReviews(caseId?: string): Promise<TridentReview[]> {
  const reviews = await readArray<TridentReview>(REVIEWS_PATH);
  return caseId ? reviews.filter((review) => review.case_id === caseId) : reviews;
}

export async function saveTrainingEvent(payload: Record<string, unknown>): Promise<TrainingEvent> {
  const records = await readArray<TrainingEvent>(TRAINING_PATH);
  const event = {
    id: `train_${randomUUID()}`,
    created_at: new Date().toISOString(),
    payload,
  };
  records.push(event);
  await writeArray(TRAINING_PATH, records);
  return event;
}

export async function updateTrainingAggregates(payload: Record<string, unknown>) {
  let aggregates: Record<string, TrainingAggregate>;
  let remoteStore: SpearStore | null = null;
  if (hasRemoteStore()) {
    remoteStore = await readRemoteStore();
    aggregates = remoteStore.trident_aggregates || {};
  } else {
    await ensureStore();
    const raw = await fs.readFile(AGGREGATES_PATH, "utf8");
    aggregates = JSON.parse(raw || "{}") as Record<string, TrainingAggregate>;
  }

  const payer = textField(payload, "payer").toUpperCase() || "UNKNOWN";
  const hcpcs = listField(payload.hcpcs)[0] || "UNKNOWN";
  const key = `${payer}:${hcpcs}`;
  const row = aggregates[key] || { count: 0, denials: 0, paid: 0, allowed_total: 0, paid_total: 0 };
  row.count += 1;
  if (textField(payload, "denial_code", "denial_reason") || textField(payload, "outcome").toLowerCase() === "denial") row.denials += 1;
  if (textField(payload, "outcome").toLowerCase() === "paid") row.paid += 1;
  row.allowed_total += Number(payload.allowed_amount || 0);
  row.paid_total += Number(payload.paid_amount || 0);
  aggregates[key] = row;

  if (remoteStore) {
    remoteStore.trident_aggregates = aggregates;
    await writeRemoteStore(remoteStore);
  } else {
    await fs.writeFile(AGGREGATES_PATH, `${JSON.stringify(aggregates, null, 2)}\n`, "utf8");
  }

  return { key, aggregate: row };
}

export async function getMetrics() {
  const records = await listCases();
  const normal = records.filter((record) => !record.archived && !String(record.patient_name || "").toLowerCase().includes("test patient") && !String(record.patient_name || "").toLowerCase().includes("synthetic") && !String(record.patient_name || "").toLowerCase().includes("validation"));
  return {
    open_cases: normal.filter((record) => record.status !== "closed").length,
    missing_docs: normal.filter((record) => record.status === "missing_docs" || record.missing_fields.length > 0).length,
    trident_review: normal.filter((record) => record.status === "trident_review" || record.trident_status === "pending").length,
    ready_to_fulfill: normal.filter((record) => record.status === "ready_to_fulfill").length,
    pod_needed: normal.filter((record) => record.status === "pod_needed" || record.status === "pod_generated" || record.pod_status === "needed" || record.pod_status === "signature_required").length,
    revenue_support: normal.filter((record) => record.status === "revenue_support").length,
    tebra_ready: normal.filter((record) => record.tebra_status === "staged_not_submitted" || record.tebra_status === "staged_for_upload" || record.status === "tebra_ready" || record.status === "staged_for_upload").length,
    high_risk_flags: normal.filter((record) => record.high_risk_flags.length > 0).length,
    needs_action: normal.filter((record) => ["created", "intake_received", "missing_docs", "trident_review", "trident_review_complete", "provider_packet_generated", "signed_swo_received", "billing_packet_generated", "pod_generated", "delivery_recorded", "signed_pod_received", "blocked_missing_fields"].includes(record.status)).length,
    awaiting_provider: normal.filter((record) => record.status === "provider_signature_requested").length,
    tebra_staged: normal.filter((record) => record.tebra_status === "staged_not_submitted" || record.tebra_status === "staged_for_upload" || record.status === "tebra_ready" || record.status === "staged_for_upload").length,
    ready_to_bill: normal.filter((record) => record.status === "ready_to_bill").length,
    blocked_cases: normal.filter((record) => record.status === "blocked_missing_fields" || record.missing_fields.length > 0).length,
  };
}

export async function getStoreSnapshot() {
  return {
    cases: await listCases(),
    events: await listWorkflowEvents(),
    trident_reviews: await listTridentReviews(),
  };
}
