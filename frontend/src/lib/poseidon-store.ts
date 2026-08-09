import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Pool as PgPool } from "pg";

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
  | "blocked_destination_unverified"
  | "packet_review_required"
  | "reviewer_certified"
  | "submission_queued"
  | "submission_sent"
  | "delivery_confirmed"
  | "payer_disposition_pending"
  | "payer_no_auth_required_verified"
  | "authorized"
  | "partially_authorized"
  | "denied"
  | "additional_information_requested"
  | "appeal_required"
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
  final_hcpcs?: string[] | null;
  source_icd?: string[];
  trident_recommended_icd?: string[];
  operator_approved_icd?: string[];
  final_icd?: string[] | null;
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
  attached_at?: string;
  storage_status?: string;
  metadata?: Record<string, unknown>;
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
const SQL_STORE_KEY = process.env.SPEAR_SQL_STORE_KEY || "spear-production";

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
  return hasSqlStore() || hasGistStore();
}

function databaseUrl() {
  return process.env.SPEAR_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || "";
}

function hasSqlStore() {
  return Boolean(databaseUrl() && process.env.SPEAR_DISABLE_SQL_STORE !== "true");
}

function hasGistStore() {
  return Boolean(process.env.SPEAR_STORE_GIST_ID && process.env.SPEAR_GITHUB_TOKEN);
}

function shouldPreserveRemoteBytes(record: { kind?: string; metadata?: Record<string, unknown> }) {
  return record.metadata?.preserve_bytes === true || [
    "trident_hard_packet",
    "submission_confirmation",
  ].includes(String(record.kind || ""));
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
  if (hasSqlStore()) return readSqlStore();
  return readGistStore();
}

async function writeRemoteStore(store: SpearStore) {
  if (hasSqlStore()) {
    await writeSqlStore(store);
    return;
  }
  await writeGistStore(store);
}

let sqlPool: PgPool | null = null;
let sqlStoreReady = false;

async function getSqlPool() {
  if (sqlPool) return sqlPool;
  const { Pool } = await import("pg");
  const connectionString = databaseUrl();
  sqlPool = new Pool({
    connectionString,
    max: Number(process.env.SPEAR_SQL_POOL_MAX || 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    ssl: /sslmode=require|neon|supabase|render|railway/i.test(connectionString)
      ? { rejectUnauthorized: false }
      : undefined,
  });
  return sqlPool;
}

async function ensureSqlStore() {
  if (sqlStoreReady) return;
  const pool = await getSqlPool();
  await pool.query(`
    create table if not exists spear_store_snapshots (
      store_key text primary key,
      store jsonb not null,
      updated_at timestamptz not null default now()
    )
  `);
  await pool.query(
    `
      insert into spear_store_snapshots (store_key, store)
      values ($1, $2::jsonb)
      on conflict (store_key) do nothing
    `,
    [SQL_STORE_KEY, JSON.stringify(emptyStore())],
  );
  sqlStoreReady = true;
}

async function readSqlStore(): Promise<SpearStore> {
  await ensureSqlStore();
  const pool = await getSqlPool();
  const result = await pool.query("select store from spear_store_snapshots where store_key = $1", [SQL_STORE_KEY]);
  return { ...emptyStore(), ...(result.rows[0]?.store || {}) };
}

async function writeSqlStore(store: SpearStore) {
  await ensureSqlStore();
  const pool = await getSqlPool();
  await pool.query(
    `
      insert into spear_store_snapshots (store_key, store, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (store_key)
      do update set store = excluded.store, updated_at = now()
    `,
    [SQL_STORE_KEY, JSON.stringify({ ...emptyStore(), ...store })],
  );
}

async function readGistStore(): Promise<SpearStore> {
  const gistId = process.env.SPEAR_STORE_GIST_ID;
  const token = process.env.SPEAR_GITHUB_TOKEN;
  if (!gistId || !token) return emptyStore();

  async function readRawFallback(rawUrl?: string): Promise<SpearStore | null> {
    const url = rawUrl || `https://gist.githubusercontent.com/${GIST_RAW_OWNER}/${gistId}/raw/${GIST_FILENAME}`;
    const rawResponse = await fetch(url, {
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
  const file = gist?.files?.[GIST_FILENAME];
  const content = file?.content;
  if (!content || typeof content !== "string") return emptyStore();
  try {
    return { ...emptyStore(), ...JSON.parse(content) };
  } catch (error) {
    const raw = await readRawFallback(typeof file?.raw_url === "string" ? file.raw_url : undefined);
    if (raw) return raw;
    throw error;
  }
}

async function writeGistStore(store: SpearStore) {
  const gistId = process.env.SPEAR_STORE_GIST_ID;
  const token = process.env.SPEAR_GITHUB_TOKEN;
  if (!gistId || !token) return;

  const compactStore = {
    ...store,
    documents: store.documents.map((document) => ({
      ...document,
      content_base64: "",
      storage_note: "Binary content omitted from Gist fallback. Configure SQL/object storage for durable document bytes.",
    })),
    artifacts: store.artifacts.map((artifact) => shouldPreserveRemoteBytes(artifact)
      ? artifact
      : {
          ...artifact,
          content_base64: "",
          storage_note: "Binary content omitted from Gist fallback. Configure SQL/object storage for durable artifact bytes.",
        }),
  };

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
          content: `${JSON.stringify(compactStore, null, 2)}\n`,
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

function optionalText(payload: Record<string, unknown>, ...keys: string[]): string | undefined {
  const value = textField(payload, ...keys);
  return value || undefined;
}

function objectField<T = unknown>(payload: Record<string, unknown>, key: string): T | undefined {
  const value = payload[key];
  return value && typeof value === "object" ? value as T : undefined;
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
  if (hasRemoteStore()) {
    const store = await readRemoteStore();
    store.documents.push(document);
    store.events.push({
      id: `evt_${randomUUID()}`,
      case_id: input.case_id,
      event_type: "document_stored",
      payload: {
        document_id: document.id,
        kind: document.kind,
        filename: document.filename,
        size: document.size,
      },
      created_at: new Date().toISOString(),
    });
    await writeRemoteStore(store);
    return document;
  }

  const records = await readArray<StoredDocument>(DOCUMENTS_PATH);
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

export async function saveDocumentAndUpdateCase(input: {
  case_id: string;
  kind: string;
  filename: string;
  content_type: string;
  content: Buffer;
  case_patch: Partial<SpearCase>;
  event_type: string;
  event_payload: Record<string, unknown>;
}): Promise<{ document: StoredDocument; case: SpearCase | null; event: WorkflowEvent | null }> {
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
  const event = {
    id: `evt_${randomUUID()}`,
    case_id: input.case_id,
    event_type: input.event_type,
    payload: {
      document_id: document.id,
      filename: document.filename,
      kind: document.kind,
      ...input.event_payload,
    },
    created_at: new Date().toISOString(),
  };
  const documentCasePatch = {
    ...input.case_patch,
    ...(input.kind === "signed_swo" ? { signed_swo_document_id: document.id } : {}),
    ...(input.kind === "signed_pod" ? { signed_pod_document_id: document.id } : {}),
  };

  if (hasRemoteStore()) {
    const store = await readRemoteStore();
    const index = store.cases.findIndex((record) => record.id === input.case_id || record.order_id === input.case_id);
    if (index === -1) return { document, case: null, event: null };
    const updated = {
      ...store.cases[index],
      ...documentCasePatch,
      updated_at: new Date().toISOString(),
    };
    store.cases[index] = updated;
    store.documents.push(document);
    store.events.push(event);
    await writeRemoteStore(store);
    return { document, case: updated, event };
  }

  const records = await readArray<SpearCase>(CASES_PATH);
  const index = records.findIndex((record) => record.id === input.case_id || record.order_id === input.case_id);
  if (index === -1) return { document, case: null, event: null };
  const updated = {
    ...records[index],
    ...documentCasePatch,
    updated_at: new Date().toISOString(),
  };
  records[index] = updated;
  await writeArray(CASES_PATH, records);

  const documents = await readArray<StoredDocument>(DOCUMENTS_PATH);
  documents.push(document);
  await writeArray(DOCUMENTS_PATH, documents);

  const events = await readArray<WorkflowEvent>(EVENTS_PATH);
  events.push(event);
  await writeArray(EVENTS_PATH, events);

  return { document, case: updated, event };
}

export async function finalizeIntakeCase(input: {
  case_id: string;
  case_patch: Partial<SpearCase>;
  pending_document_id?: string;
  fallback_document?: {
    filename: string;
    content_type: string;
    content: Buffer;
  };
  review: unknown;
  events: Array<{ event_type: string; payload: unknown }>;
}): Promise<{ case: SpearCase | null; document: StoredDocument | null; review: TridentReview }> {
  const now = new Date().toISOString();
  const reviewRecord = {
    id: `tri_${randomUUID()}`,
    case_id: input.case_id,
    created_at: now,
    review: input.review,
  };

  if (hasRemoteStore()) {
    const store = await readRemoteStore();
    const caseIndex = store.cases.findIndex((record) => record.id === input.case_id || record.order_id === input.case_id);
    if (caseIndex === -1) return { case: null, document: null, review: reviewRecord };

    let document: StoredDocument | null = null;
    if (input.pending_document_id) {
      const docIndex = store.documents.findIndex((record) => record.id === input.pending_document_id);
      if (docIndex !== -1) {
        document = {
          ...store.documents[docIndex],
          case_id: store.cases[caseIndex].id,
          attached_at: now,
        };
        store.documents[docIndex] = document;
      }
    }

    if (!document && input.fallback_document) {
      document = {
        id: `doc_${randomUUID()}`,
        case_id: store.cases[caseIndex].id,
        kind: "source_intake",
        filename: input.fallback_document.filename,
        content_type: input.fallback_document.content_type,
        size: input.fallback_document.content.length,
        content_base64: input.fallback_document.content.toString("base64"),
        created_at: now,
        attached_at: now,
      };
      store.documents.push(document);
    }

    const documentPatch = document ? {
      document_ids: [document.id],
      source_document_id: document.id,
    } : {};
    const updated = {
      ...store.cases[caseIndex],
      ...input.case_patch,
      ...documentPatch,
      updated_at: now,
    };
    store.cases[caseIndex] = updated;
    store.trident_reviews.push(reviewRecord);
    store.events.push({
      id: `evt_${randomUUID()}`,
      case_id: updated.id,
      event_type: "trident_review_stored",
      payload: input.review,
      created_at: now,
    });
    if (document) {
      store.events.push({
        id: `evt_${randomUUID()}`,
        case_id: updated.id,
        event_type: "source_document_attached",
        payload: {
          document_id: document.id,
          filename: document.filename,
          size: document.size,
        },
        created_at: now,
      });
    }
    store.events.push(...input.events.map((entry) => ({
      id: `evt_${randomUUID()}`,
      case_id: updated.id,
      event_type: entry.event_type,
      payload: entry.payload,
      created_at: now,
    })));
    await writeRemoteStore(store);
    return { case: updated, document, review: reviewRecord };
  }

  const cases = await readArray<SpearCase>(CASES_PATH);
  const caseIndex = cases.findIndex((record) => record.id === input.case_id || record.order_id === input.case_id);
  if (caseIndex === -1) return { case: null, document: null, review: reviewRecord };

  const documents = await readArray<StoredDocument>(DOCUMENTS_PATH);
  let document: StoredDocument | null = null;
  if (input.pending_document_id) {
    const docIndex = documents.findIndex((record) => record.id === input.pending_document_id);
    if (docIndex !== -1) {
      document = {
        ...documents[docIndex],
        case_id: cases[caseIndex].id,
        attached_at: now,
      };
      documents[docIndex] = document;
    }
  }
  if (!document && input.fallback_document) {
    document = {
      id: `doc_${randomUUID()}`,
      case_id: cases[caseIndex].id,
      kind: "source_intake",
      filename: input.fallback_document.filename,
      content_type: input.fallback_document.content_type,
      size: input.fallback_document.content.length,
      content_base64: input.fallback_document.content.toString("base64"),
      created_at: now,
      attached_at: now,
    };
    documents.push(document);
  }
  await writeArray(DOCUMENTS_PATH, documents);

  const documentPatch = document ? {
    document_ids: [document.id],
    source_document_id: document.id,
  } : {};
  const updated = {
    ...cases[caseIndex],
    ...input.case_patch,
    ...documentPatch,
    updated_at: now,
  };
  cases[caseIndex] = updated;
  await writeArray(CASES_PATH, cases);

  const reviews = await readArray<TridentReview>(REVIEWS_PATH);
  reviews.push(reviewRecord);
  await writeArray(REVIEWS_PATH, reviews);

  const events = await readArray<WorkflowEvent>(EVENTS_PATH);
  events.push(
    {
      id: `evt_${randomUUID()}`,
      case_id: updated.id,
      event_type: "trident_review_stored",
      payload: input.review,
      created_at: now,
    },
    ...(document ? [{
      id: `evt_${randomUUID()}`,
      case_id: updated.id,
      event_type: "source_document_attached",
      payload: {
        document_id: document.id,
        filename: document.filename,
        size: document.size,
      },
      created_at: now,
    }] : []),
    ...input.events.map((entry) => ({
      id: `evt_${randomUUID()}`,
      case_id: updated.id,
      event_type: entry.event_type,
      payload: entry.payload,
      created_at: now,
    })),
  );
  await writeArray(EVENTS_PATH, events);
  return { case: updated, document, review: reviewRecord };
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
  if (hasRemoteStore()) {
    const store = await readRemoteStore();
    const index = store.documents.findIndex((record) => record.id === documentId);
    if (index === -1) return null;
    const document = {
      ...store.documents[index],
      case_id: caseId,
      attached_at: new Date().toISOString(),
    };
    store.documents[index] = document;
    store.events.push({
      id: `evt_${randomUUID()}`,
      case_id: caseId,
      event_type: "source_document_attached",
      payload: {
        document_id: document.id,
        filename: document.filename,
        size: document.size,
      },
      created_at: new Date().toISOString(),
    });
    await writeRemoteStore(store);
    return document;
  }

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
  if (hasRemoteStore()) {
    const store = await readRemoteStore();
    store.artifacts.push(artifact);
    store.events.push({
      id: `evt_${randomUUID()}`,
      case_id: input.case_id,
      event_type: "artifact_generated",
      payload: {
        artifact_id: artifact.id,
        kind: artifact.kind,
        filename: artifact.filename,
        size: artifact.size,
      },
      created_at: new Date().toISOString(),
    });
    await writeRemoteStore(store);
    return artifact;
  }

  const records = await readArray<StoredArtifact>(ARTIFACTS_PATH);
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

export async function saveArtifactAndUpdateCase(input: {
  case_id: string;
  kind: string;
  filename: string;
  content_type: string;
  content: Buffer;
  metadata?: Record<string, unknown>;
  case_patch: Partial<SpearCase>;
  event_type: string;
  event_payload?: Record<string, unknown>;
}): Promise<{ artifact: StoredArtifact; case: SpearCase | null; event: WorkflowEvent | null }> {
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
  const event = {
    id: `evt_${randomUUID()}`,
    case_id: input.case_id,
    event_type: input.event_type,
    payload: {
      artifact_id: artifact.id,
      kind: artifact.kind,
      filename: artifact.filename,
      ...(input.event_payload || {}),
    },
    created_at: new Date().toISOString(),
  };
  const artifactCasePatch = {
    ...input.case_patch,
    ...(input.kind === "billing_packet" ? { billing_packet_artifact_id: artifact.id } : {}),
    ...(input.kind === "pod" ? { pod_artifact_id: artifact.id } : {}),
    ...(input.kind === "tebra_staging_manifest" ? { tebra_manifest_artifact_id: artifact.id } : {}),
    ...(input.kind === "final_bill_ready_packet" ? { final_bill_ready_artifact_id: artifact.id } : {}),
  };

  if (hasRemoteStore()) {
    const store = await readRemoteStore();
    const index = store.cases.findIndex((record) => record.id === input.case_id || record.order_id === input.case_id);
    if (index === -1) return { artifact, case: null, event: null };
    const updated = {
      ...store.cases[index],
      ...artifactCasePatch,
      updated_at: new Date().toISOString(),
    };
    store.cases[index] = updated;
    store.artifacts.push(artifact);
    store.events.push(event);
    await writeRemoteStore(store);
    return { artifact, case: updated, event };
  }

  const records = await readArray<SpearCase>(CASES_PATH);
  const index = records.findIndex((record) => record.id === input.case_id || record.order_id === input.case_id);
  if (index === -1) return { artifact, case: null, event: null };
  const updated = {
    ...records[index],
    ...artifactCasePatch,
    updated_at: new Date().toISOString(),
  };
  records[index] = updated;
  await writeArray(CASES_PATH, records);

  const artifacts = await readArray<StoredArtifact>(ARTIFACTS_PATH);
  artifacts.push(artifact);
  await writeArray(ARTIFACTS_PATH, artifacts);

  const events = await readArray<WorkflowEvent>(EVENTS_PATH);
  events.push(event);
  await writeArray(EVENTS_PATH, events);

  return { artifact, case: updated, event };
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
  if (hasRemoteStore()) {
    const store = await readRemoteStore();
    store.artifacts.push(...artifacts);
    store.events.push({
      id: `evt_${randomUUID()}`,
      case_id: inputs[0].case_id,
      event_type: "artifacts_generated",
      payload: {
        artifact_ids: artifacts.map((artifact) => artifact.id),
        kinds: artifacts.map((artifact) => artifact.kind),
      },
      created_at: new Date().toISOString(),
    });
    await writeRemoteStore(store);
    return artifacts;
  }

  const records = await readArray<StoredArtifact>(ARTIFACTS_PATH);
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
  if (hasRemoteStore()) {
    const store = await readRemoteStore();
    const existing = findDuplicateCase(store.cases, record);
    if (existing) return existing;
    store.cases.unshift(record);
    store.events.push({
      id: `evt_${randomUUID()}`,
      case_id: record.id,
      event_type: "case_created",
      payload: { order_id: record.order_id, status: record.status },
      created_at: new Date().toISOString(),
    });
    await writeRemoteStore(store);
    return record;
  }

  const records = await readArray<SpearCase>(CASES_PATH);
  const existing = findDuplicateCase(records, record);
  if (existing) return existing;
  records.unshift(record);
  await writeArray(CASES_PATH, records);
  await appendWorkflowEvent(record.id, "case_created", { order_id: record.order_id, status: record.status });
  return record;
}

function findDuplicateCase(records: SpearCase[], incoming: SpearCase): SpearCase | null {
  const idempotencyKey = String(incoming.idempotency_key || "");
  if (idempotencyKey) {
    const exact = records.find((record) => String(record.idempotency_key || "") === idempotencyKey);
    if (exact) return exact;
  }
  const patient = String(incoming.patient_name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const member = String(incoming.member_id || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const dos = String(incoming.order_date || "");
  const hcpcs = (incoming.hcpcs || []).join(",");
  const sourceRef = String(incoming.source_reference || incoming.source_document_id || "");
  return records.find((record) => {
    if (sourceRef && String(record.source_reference || record.source_document_id || "") === sourceRef) return true;
    return String(record.patient_name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === patient
      && String(record.member_id || "").toLowerCase().replace(/[^a-z0-9]+/g, "") === member
      && String(record.order_date || "") === dos
      && (record.hcpcs || []).join(",") === hcpcs;
  }) || null;
}

function normalizeCase(payload: Record<string, unknown>): SpearCase {
  const now = new Date().toISOString();
  const sourceHcpcs = listField(payload.source_hcpcs || payload.hcpcs || payload.hcpcs_codes);
  const tridentHcpcs = listField(payload.trident_recommended_hcpcs);
  const approvedHcpcs = listField(payload.operator_approved_hcpcs);
  const explicitFinalHcpcs = listField(payload.final_hcpcs ?? payload.operator_approved_hcpcs);
  const finalHcpcs = explicitFinalHcpcs.length ? explicitFinalHcpcs : null;
  const sourceIcd = listField(payload.source_icd || payload.icd || payload.icd10 || payload.icd10_codes || payload.diagnosis_codes);
  const tridentIcd = listField(payload.trident_recommended_icd);
  const approvedIcd = listField(payload.operator_approved_icd);
  const explicitFinalIcd = listField(payload.final_icd ?? payload.operator_approved_icd);
  const finalIcd = explicitFinalIcd.length ? explicitFinalIcd : null;
  const hcpcs = finalHcpcs?.length ? finalHcpcs : sourceHcpcs;
  const icd = finalIcd?.length ? finalIcd : sourceIcd;
  const codingPending = !finalHcpcs?.length;
  const base: Partial<SpearCase> = {
    id: textField(payload, "id", "case_id") || `case_${randomUUID()}`,
    order_id: textField(payload, "order_id") || `ord_${randomUUID()}`,
    patient_name: textField(payload, "patient_name", "patient"),
    first_name: optionalText(payload, "first_name"),
    last_name: optionalText(payload, "last_name"),
    dob: textField(payload, "dob", "date_of_birth"),
    patient_id: optionalText(payload, "patient_id", "patientId", "external_patient_id"),
    phone: optionalText(payload, "phone"),
    email: optionalText(payload, "email"),
    address: optionalText(payload, "address"),
    mrn: optionalText(payload, "mrn"),
    payer: textField(payload, "payer", "payer_name", "payer_id"),
    raw_payer: optionalText(payload, "raw_payer", "payer_raw"),
    canonical_payer: optionalText(payload, "canonical_payer", "payer", "payer_name"),
    canonical_payer_id: optionalText(payload, "canonical_payer_id", "payer_id"),
    payer_match_status: optionalText(payload, "payer_match_status"),
    payer_match_confidence: payload.payer_match_confidence,
    payer_normalization: objectField(payload, "payer_normalization"),
    member_id: textField(payload, "member_id", "insurance_id", "insuranceId"),
    group_number: optionalText(payload, "group_number", "group_id"),
    facility: optionalText(payload, "facility", "facility_name", "facility_name_raw"),
    facility_id: optionalText(payload, "facility_id"),
    facility_name_raw: optionalText(payload, "facility_name_raw", "facility_name"),
    facility_match: objectField(payload, "facility_match"),
    provider: textField(payload, "provider", "provider_name", "physician", "referring_provider"),
    provider_id: optionalText(payload, "provider_id"),
    provider_name_raw: optionalText(payload, "provider_name_raw", "provider_name", "provider"),
    provider_npi_raw: optionalText(payload, "provider_npi_raw", "provider_npi", "referring_npi", "npi"),
    provider_match: objectField(payload, "provider_match"),
    provider_registry_status: optionalText(payload, "provider_registry_status"),
    provider_registry_incomplete: payload.provider_registry_incomplete === true,
    npi_source: optionalText(payload, "npi_source"),
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
    date_of_service: optionalText(payload, "date_of_service", "dos"),
    state: optionalText(payload, "state"),
    payer_submission_destination: optionalText(payload, "payer_submission_destination", "submission_destination", "payer_fax", "authorization_fax"),
    payer_fax: optionalText(payload, "payer_fax"),
    authorization_fax: optionalText(payload, "authorization_fax"),
    destination_verified_at: optionalText(payload, "destination_verified_at"),
    no_auth_required_evidence: optionalText(payload, "no_auth_required_evidence"),
    eligibility_status: optionalText(payload, "eligibility_status"),
    benefit_status: optionalText(payload, "benefit_status"),
    eligibility_source: optionalText(payload, "eligibility_source"),
    policy_source: optionalText(payload, "policy_source"),
    policy_effective_date: optionalText(payload, "policy_effective_date"),
    plan_product: optionalText(payload, "plan_product"),
    diagnostics_summary: optionalText(payload, "diagnostics_summary"),
    parser_source: optionalText(payload, "parser_source"),
    raw_text: optionalText(payload, "raw_text"),
    notes: optionalText(payload, "notes"),
    source_document: optionalText(payload, "source_document"),
    source_document_id: optionalText(payload, "source_document_id", "document_id"),
    extraction_result: objectField(payload, "extraction_result"),
    operator_corrections: Array.isArray(payload.operator_corrections) ? payload.operator_corrections : [],
    patient_match_decision: optionalText(payload, "patient_match_decision"),
    matched_case_id: optionalText(payload, "matched_case_id"),
    priority: optionalText(payload, "priority") || "standard",
    billing_status: textField(payload, "billing_status") || "not_ready",
    trident_status: textField(payload, "trident_status") || "pending",
    pod_status: textField(payload, "pod_status") || "not_started",
    tebra_status: textField(payload, "tebra_status") || "not_staged",
    intake_status: textField(payload, "intake_status") || "INTAKE_VALIDATION",
    trident_production_status: textField(payload, "trident_production_status") || "RECEIVED",
    payer_submission_status: textField(payload, "payer_submission_status") || "NOT_READY",
    payer_disposition_status: textField(payload, "payer_disposition_status") || "NOT_STARTED",
    provider_signature_status: textField(payload, "provider_signature_status") || "NOT_REQUESTED",
    fulfillment_delivery_status: textField(payload, "fulfillment_delivery_status") || "NOT_READY",
    billing_tebra_status: textField(payload, "billing_tebra_status") || "NOT_READY",
    overall_case_status: textField(payload, "overall_case_status") || "RECEIVED",
    procedural_posture: textField(payload, "procedural_posture") || "",
    route: textField(payload, "route") || "",
    packet_title: textField(payload, "packet_title") || "",
    idempotency_key: textField(payload, "idempotency_key") || buildIdempotencyKey(payload),
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

function buildIdempotencyKey(payload: Record<string, unknown>) {
  const basis = [
    textField(payload, "source") || "spear_intake",
    textField(payload, "source_reference", "source_document_id", "document_id"),
    textField(payload, "patient_name", "patient"),
    textField(payload, "dob", "date_of_birth"),
    textField(payload, "payer", "payer_name", "payer_id"),
    textField(payload, "member_id", "insurance_id", "insuranceId"),
    textField(payload, "order_date", "date_of_service"),
    listField(payload.hcpcs || payload.hcpcs_codes).join(","),
  ].join("|").toLowerCase();
  return `idem_${Buffer.from(basis).toString("base64url").slice(0, 48)}`;
}

export async function updateCase(caseId: string, patch: Partial<SpearCase>): Promise<SpearCase | null> {
  if (hasRemoteStore()) {
    const store = await readRemoteStore();
    const index = store.cases.findIndex((record) => record.id === caseId || record.order_id === caseId);
    if (index === -1) return null;
    const updated = {
      ...store.cases[index],
      ...patch,
      updated_at: new Date().toISOString(),
    };
    store.cases[index] = updated;
    await writeRemoteStore(store);
    return updated;
  }

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

export async function updateCaseAndAppendEvent(
  caseId: string,
  patch: Partial<SpearCase>,
  eventType: string,
  payload: unknown,
): Promise<{ case: SpearCase | null; event: WorkflowEvent | null }> {
  const event = {
    id: `evt_${randomUUID()}`,
    case_id: caseId,
    event_type: eventType,
    payload,
    created_at: new Date().toISOString(),
  };

  if (hasRemoteStore()) {
    const store = await readRemoteStore();
    const index = store.cases.findIndex((record) => record.id === caseId || record.order_id === caseId);
    if (index === -1) return { case: null, event: null };
    const updated = {
      ...store.cases[index],
      ...patch,
      updated_at: new Date().toISOString(),
    };
    store.cases[index] = updated;
    store.events.push(event);
    await writeRemoteStore(store);
    return { case: updated, event };
  }

  const records = await readArray<SpearCase>(CASES_PATH);
  const index = records.findIndex((record) => record.id === caseId || record.order_id === caseId);
  if (index === -1) return { case: null, event: null };
  const updated = {
    ...records[index],
    ...patch,
    updated_at: new Date().toISOString(),
  };
  records[index] = updated;
  await writeArray(CASES_PATH, records);
  await appendWorkflowEvent(caseId, eventType, payload);
  return { case: updated, event };
}

export async function appendWorkflowEvent(caseId: string, eventType: string, payload: unknown): Promise<WorkflowEvent> {
  const event = {
    id: `evt_${randomUUID()}`,
    case_id: caseId,
    event_type: eventType,
    payload,
    created_at: new Date().toISOString(),
  };
  if (hasRemoteStore()) {
    const store = await readRemoteStore();
    store.events.push(event);
    await writeRemoteStore(store);
    return event;
  }

  const events = await readArray<WorkflowEvent>(EVENTS_PATH);
  events.push(event);
  await writeArray(EVENTS_PATH, events);
  return event;
}

export async function appendWorkflowEvents(caseId: string, entries: Array<{ event_type: string; payload: unknown }>): Promise<WorkflowEvent[]> {
  if (!entries.length) return [];
  const created = entries.map((entry) => ({
    id: `evt_${randomUUID()}`,
    case_id: caseId,
    event_type: entry.event_type,
    payload: entry.payload,
    created_at: new Date().toISOString(),
  }));
  if (hasRemoteStore()) {
    const store = await readRemoteStore();
    store.events.push(...created);
    await writeRemoteStore(store);
    return created;
  }

  const events = await readArray<WorkflowEvent>(EVENTS_PATH);
  events.push(...created);
  await writeArray(EVENTS_PATH, events);
  return created;
}

export async function listWorkflowEvents(caseId?: string): Promise<WorkflowEvent[]> {
  const events = await readArray<WorkflowEvent>(EVENTS_PATH);
  return caseId ? events.filter((event) => event.case_id === caseId) : events;
}

export async function saveTridentReview(caseId: string, review: unknown): Promise<TridentReview> {
  const stored = {
    id: `tri_${randomUUID()}`,
    case_id: caseId,
    created_at: new Date().toISOString(),
    review,
  };
  if (hasRemoteStore()) {
    const store = await readRemoteStore();
    store.trident_reviews.push(stored);
    store.events.push({
      id: `evt_${randomUUID()}`,
      case_id: caseId,
      event_type: "trident_review_stored",
      payload: review,
      created_at: new Date().toISOString(),
    });
    await writeRemoteStore(store);
    return stored;
  }

  const reviews = await readArray<TridentReview>(REVIEWS_PATH);
  reviews.push(stored);
  await writeArray(REVIEWS_PATH, reviews);
  await appendWorkflowEvent(caseId, "trident_review_stored", review);
  return stored;
}

export async function saveTridentReviewAndUpdateCase(
  caseId: string,
  review: unknown,
  patch: Partial<SpearCase>,
): Promise<{ review: TridentReview; case: SpearCase | null }> {
  const stored = {
    id: `tri_${randomUUID()}`,
    case_id: caseId,
    created_at: new Date().toISOString(),
    review,
  };

  if (hasRemoteStore()) {
    const store = await readRemoteStore();
    const index = store.cases.findIndex((record) => record.id === caseId || record.order_id === caseId);
    const updated = index === -1 ? null : {
      ...store.cases[index],
      ...patch,
      updated_at: new Date().toISOString(),
    };
    if (index !== -1 && updated) store.cases[index] = updated;
    store.trident_reviews.push(stored);
    store.events.push({
      id: `evt_${randomUUID()}`,
      case_id: caseId,
      event_type: "trident_review_stored",
      payload: review,
      created_at: new Date().toISOString(),
    });
    await writeRemoteStore(store);
    return { review: stored, case: updated };
  }

  const reviews = await readArray<TridentReview>(REVIEWS_PATH);
  reviews.push(stored);
  await writeArray(REVIEWS_PATH, reviews);
  const updated = await updateCase(caseId, patch);
  await appendWorkflowEvent(caseId, "trident_review_stored", review);
  return { review: stored, case: updated };
}

export async function listTridentReviews(caseId?: string): Promise<TridentReview[]> {
  const reviews = await readArray<TridentReview>(REVIEWS_PATH);
  return caseId ? reviews.filter((review) => review.case_id === caseId) : reviews;
}

export async function saveTrainingEvent(payload: Record<string, unknown>): Promise<TrainingEvent> {
  const event = {
    id: `train_${randomUUID()}`,
    created_at: new Date().toISOString(),
    payload,
  };
  if (hasRemoteStore()) {
    const store = await readRemoteStore();
    store.training_events.push(event);
    await writeRemoteStore(store);
    return event;
  }

  const records = await readArray<TrainingEvent>(TRAINING_PATH);
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
    packets_awaiting_certification: normal.filter((record) => record.trident_production_status === "PACKET_REVIEW_REQUIRED").length,
    submissions_awaiting_confirmation: normal.filter((record) => ["SUBMISSION_QUEUED", "SUBMISSION_SENT"].includes(String(record.payer_submission_status || ""))).length,
    payer_disposition_pending: normal.filter((record) => record.payer_disposition_status === "PAYER_DISPOSITION_PENDING").length,
    authorized: normal.filter((record) => record.payer_disposition_status === "AUTHORIZED").length,
    denials_and_appeals: normal.filter((record) => ["DENIED", "APPEAL_REQUIRED"].includes(String(record.payer_disposition_status || ""))).length,
  };
}

export async function getStoreSnapshot() {
  return {
    cases: await listCases(),
    events: await listWorkflowEvents(),
    trident_reviews: await listTridentReviews(),
  };
}

export function getStoreBackendStatus() {
  return {
    backend: hasSqlStore() ? "postgres" : hasGistStore() ? "gist" : "local",
    sql_configured: hasSqlStore(),
    gist_configured: hasGistStore(),
    store_key: hasSqlStore() ? SQL_STORE_KEY : undefined,
  };
}
