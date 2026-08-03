"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import SpearShellLayout from "@/components/spear/SpearShellLayout";

const PIPELINE = [
  "Intake","OCR","Match","Optimize","Trident","SWO",
  "Addendum","Sign","Receive","Deploy","Bill","Close"
];

const METRICS = [
  { label: "Needs Action",       key: "needsAction", href: "/spear/cases?filter=needs-action" },
  { label: "Awaiting Provider",  key: "awaitingProvider", href: "/spear/cases?filter=awaiting-provider" },
  { label: "Ready to Fulfill",   key: "readyToFulfill", href: "/spear/cases?filter=ready-to-fulfill" },
  { label: "POD Needed",         key: "podNeeded", href: "/spear/cases?filter=pod-needed" },
  { label: "Tebra Staged",       key: "tebraStaged", href: "/spear/cases?filter=tebra-staged" },
  { label: "Ready to Bill",      key: "readyToBill", href: "/spear/cases?filter=ready-to-bill" },
  { label: "Blocked Cases",      key: "blockedCases", href: "/spear/cases?filter=needs-action" },
  { label: "High-Risk Flags",    key: "highRiskFlags", href: "/spear/cases?filter=all" },
];

export default function CommandPage() {
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/spear/metrics")
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `${r.status} ${r.statusText}`);
        setMetrics(data.metrics || {});
        setError("");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Metrics unavailable"));
  }, []);

  return (
    <SpearShellLayout>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>Command</h1>
        <p style={{ color: "#64748B", fontSize: 14, margin: 0 }}>SPEAR workflow overview</p>
      </div>

      {/* Pipeline */}
      <div style={{
        background: "#FFFFFF", border: "1px solid #E2E8F0",
        borderRadius: 12, padding: "24px 28px", marginBottom: 24,
      }}>
        <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em",
          color: "#94A3B8", textTransform: "uppercase", margin: "0 0 20px" }}>
          Workflow Pipeline
        </p>
        <div style={{ display: "flex", alignItems: "center", overflowX: "auto" }}>
          {PIPELINE.map((stage, i) => (
            <div key={stage} style={{ display: "flex", alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 64 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "#F8FAFC", border: "1.5px solid #CBD5E1",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 600, color: "#475569",
                }}>
                  {i + 1}
                </div>
                <span style={{ fontSize: 10, color: "#64748B", marginTop: 5, whiteSpace: "nowrap" }}>
                  {stage}
                </span>
              </div>
              {i < PIPELINE.length - 1 && (
                <div style={{ width: 20, height: 1, background: "#E2E8F0", flexShrink: 0 }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Metrics */}
      <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em",
        color: "#94A3B8", textTransform: "uppercase", margin: "0 0 14px" }}>
        Live Metrics
      </p>
      {error ? (
        <div style={{ marginBottom: 14, border: "1px solid #FDE68A", background: "#FFFBEB", color: "#92400E", borderRadius: 8, padding: "10px 12px", fontSize: 13 }}>
          Metrics connection warning: {error}
        </div>
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {METRICS.map(({ label, key, href }) => (
          <Link key={key} href={href} style={{
            background: "#FFFFFF", border: "1px solid #E2E8F0",
            borderRadius: 10, padding: "20px 22px", textDecoration: "none",
          }}>
            <div style={{ fontSize: 30, fontWeight: 700, color: "#0F172A" }}>
              {metrics[key] ?? metrics[key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)] ?? 0}
            </div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>{label}</div>
          </Link>
        ))}
      </div>
    </SpearShellLayout>
  );
}
