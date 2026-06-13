"use client";
import { useEffect, useState } from "react";
import SpearShellLayout from "@/components/spear/SpearShellLayout";

const PIPELINE = [
  "Intake","OCR","Match","Optimize","Trident","SWO",
  "Addendum","Sign","Receive","Deploy","Bill","Close"
];

const METRICS = [
  { label: "Open Cases",       key: "openCases" },
  { label: "Missing Docs",     key: "missingDocs" },
  { label: "Trident Review",   key: "tridentReview" },
  { label: "Ready to Fulfill", key: "readyToFulfill" },
  { label: "POD Needed",       key: "podNeeded" },
  { label: "Revenue Support",  key: "revenueSupport" },
  { label: "Tebra Ready",      key: "tebraReady" },
  { label: "High-Risk Flags",  key: "highRiskFlags" },
];

export default function CommandPage() {
  const [metrics, setMetrics] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch("/api/spear/metrics")
      .then(r => r.ok ? r.json() : {})
      .then(setMetrics)
      .catch(() => {});
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {METRICS.map(({ label, key }) => (
          <div key={key} style={{
            background: "#FFFFFF", border: "1px solid #E2E8F0",
            borderRadius: 10, padding: "20px 22px",
          }}>
            <div style={{ fontSize: 30, fontWeight: 700, color: "#0F172A" }}>
              {metrics[key] ?? 0}
            </div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>
    </SpearShellLayout>
  );
}
