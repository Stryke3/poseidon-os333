import fs from "node:fs";
import { Pool } from "pg";

const envFile = process.argv.find((arg) => arg.startsWith("--env="))?.slice("--env=".length);

if (envFile) {
  const raw = fs.readFileSync(envFile, "utf8");
  for (const line of raw.split(/\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const databaseUrl =
  process.env.SPEAR_DATABASE_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  "";
const gistId = process.env.SPEAR_STORE_GIST_ID || "";
const gistToken = process.env.SPEAR_GITHUB_TOKEN || "";
const gistFilename = process.env.SPEAR_STORE_GIST_FILENAME || "spear-store.json";
const gistOwner = process.env.SPEAR_STORE_GIST_OWNER || "Stryke3";
const storeKey = process.env.SPEAR_SQL_STORE_KEY || "spear-production";

function emptyStore() {
  return {
    cases: [],
    events: [],
    trident_reviews: [],
    training_events: [],
    trident_aggregates: {},
    documents: [],
    artifacts: [],
    master_data: {
      payers: [],
      providers: [],
      facilities: [],
      carepaths: [],
      kits: [],
      code_sets: [],
      unmatched_payers: [],
    },
  };
}

async function readGistStore() {
  if (!gistId || !gistToken) throw new Error("Missing SPEAR_STORE_GIST_ID or SPEAR_GITHUB_TOKEN.");
  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      Authorization: `Bearer ${gistToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Gist read failed: ${response.status}`);
  const gist = await response.json();
  const file = gist?.files?.[gistFilename];
  if (!file) throw new Error(`Gist file ${gistFilename} not found.`);
  if (typeof file.content === "string" && file.truncated !== true) {
    return { ...emptyStore(), ...JSON.parse(file.content) };
  }
  const rawUrl = file.raw_url || `https://gist.githubusercontent.com/${gistOwner}/${gistId}/raw/${gistFilename}`;
  const rawResponse = await fetch(rawUrl, { cache: "no-store" });
  if (!rawResponse.ok) throw new Error(`Gist raw read failed: ${rawResponse.status}`);
  return { ...emptyStore(), ...JSON.parse(await rawResponse.text()) };
}

async function writeSqlStore(store) {
  if (!databaseUrl) throw new Error("Missing DATABASE_URL/POSTGRES_URL/SPEAR_DATABASE_URL.");
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    ssl: /sslmode=require|neon|supabase|render|railway/i.test(databaseUrl)
      ? { rejectUnauthorized: false }
      : undefined,
  });
  try {
    await pool.query(`
      create table if not exists spear_store_snapshots (
        store_key text primary key,
        store jsonb not null,
        updated_at timestamptz not null default now()
      )
    `);
    await pool.query(
      `
        insert into spear_store_snapshots (store_key, store, updated_at)
        values ($1, $2::jsonb, now())
        on conflict (store_key)
        do update set store = excluded.store, updated_at = now()
      `,
      [storeKey, JSON.stringify(store)],
    );
  } finally {
    await pool.end();
  }
}

const source = process.argv.includes("--empty") ? "empty" : "gist";
const store = source === "empty" ? emptyStore() : await readGistStore();
await writeSqlStore(store);

console.log(JSON.stringify({
  ok: true,
  source,
  store_key: storeKey,
  counts: {
    cases: store.cases.length,
    events: store.events.length,
    trident_reviews: store.trident_reviews.length,
    training_events: store.training_events.length,
    documents: store.documents.length,
    artifacts: store.artifacts.length,
  },
}, null, 2));
