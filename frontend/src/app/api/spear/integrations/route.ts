import { NextResponse } from "next/server";
import { getStoreBackendStatus, getStoreSnapshot } from "@/lib/poseidon-store";
import { faxProviderHealth } from "@/lib/trident/fax-adapter";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";

export const dynamic = "force-dynamic";

async function probe(name: string, rawUrl: string | undefined) {
  const url = String(rawUrl || "").trim().replace(/\/$/, "");
  if (!url) return { name, configured: false, status: "not_configured", http_status: null, latency_ms: null };
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${url}/health`, { cache: "no-store", signal: controller.signal });
    return { name, configured: true, status: response.ok ? "healthy" : "degraded", http_status: response.status, latency_ms: Date.now() - started };
  } catch {
    return { name, configured: true, status: "unreachable", http_status: null, latency_ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;
  const started = Date.now();
  const [snapshot, poseidon, trident, intake] = await Promise.all([
    getStoreSnapshot(),
    probe("poseidon", process.env.POSEIDON_API_URL || process.env.CORE_API_URL),
    probe("trident", process.env.TRIDENT_API_URL),
    probe("intake", process.env.INTAKE_API_URL),
  ]);
  return NextResponse.json({
    ok: true,
    checked_at: new Date().toISOString(),
    store: { ...getStoreBackendStatus(), status: "readable", read_ms: Date.now() - started, counts: { cases: snapshot.cases.length, events: snapshot.events.length } },
    fax: faxProviderHealth(),
    services: [poseidon, trident, intake],
    tebra: { configured: Boolean(process.env.TEBRA_API_URL && process.env.TEBRA_API_KEY), mode: process.env.TEBRA_API_URL && process.env.TEBRA_API_KEY ? "api" : "staged_export_only" },
  });
}
