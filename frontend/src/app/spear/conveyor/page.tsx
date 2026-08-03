"use client"

import { useState } from "react"

import SpearShellLayout from "@/components/spear/SpearShellLayout"

type ConveyorResult = {
  ok?: boolean
  mode?: string
  docker_used?: boolean
  availity_called?: boolean
  patient_id?: string
  order_id?: string
  workflow?: Record<string, string>
  final_status?: {
    status?: string
    billing_status?: string
    tebra_status?: string
    pod_status?: string
  }
  artifacts?: Record<string, string>
  message?: string
  error?: string
}

function valueText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "--"
  if (typeof value === "boolean") return value ? "true" : "false"
  return String(value)
}

export default function SpearConveyorPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ConveyorResult | null>(null)

  async function runConveyor() {
    setLoading(true)
    setResult(null)
    try {
      const response = await fetch("/api/conveyor/run-local-proof", {
        method: "POST",
        cache: "no-store",
      })
      const data = await response.json()
      setResult(data)
    } catch (error) {
      setResult({
        ok: false,
        message: "Unable to run SPEAR conveyor",
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setLoading(false)
    }
  }

  const finalStatus = result?.final_status ?? {}
  const workflow = result?.workflow ?? {}
  const artifacts = result?.artifacts ?? {}

  return (
    <SpearShellLayout>
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-start justify-between gap-6">
          <div>
            <p className="mb-1 font-syne text-xs uppercase tracking-widest text-black/40">
              SPEAR Core Conveyor
            </p>
            <h1 className="font-syne text-3xl font-bold tracking-tight text-black">
              Local Proof Conveyor
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-black/50">
              Runs the no-Docker local proof path and reports only returned proof data.
            </p>
          </div>
          <button
            type="button"
            onClick={runConveyor}
            disabled={loading}
            className="rounded-md bg-black px-5 py-3 font-syne text-[13px] font-medium text-white transition-colors hover:bg-black/80 disabled:cursor-not-allowed disabled:bg-black/30"
          >
            {loading ? "Running..." : "Run SPEAR Conveyor"}
          </button>
        </div>

        {result && result.ok !== true && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {result.message ?? "SPEAR conveyor did not return ok: true."}
            {result.error ? ` ${result.error}` : ""}
          </div>
        )}

        {result?.ok === true && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              {[
                ["patient_id", result.patient_id],
                ["order_id", result.order_id],
                ["mode", result.mode],
                ["docker_used", result.docker_used],
                ["availity_called", result.availity_called],
                ["orders.status", finalStatus.status],
                ["orders.billing_status", finalStatus.billing_status],
                ["tebra_status", finalStatus.tebra_status],
                ["pod_status", finalStatus.pod_status],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border border-black/5 bg-black/[0.02] p-4">
                  <div className="mb-2 font-mono text-[11px] text-black/35">{label}</div>
                  <div className="break-words font-syne text-sm font-medium text-black">
                    {valueText(value)}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-black/5">
              <div className="border-b border-black/5 p-4">
                <h2 className="font-syne text-sm font-semibold text-black">Workflow States</h2>
              </div>
              <div className="grid grid-cols-1 gap-px bg-black/5 md:grid-cols-3">
                {Object.entries(workflow).map(([key, value]) => (
                  <div key={key} className="bg-white p-4">
                    <div className="mb-1 font-mono text-[11px] text-black/35">{key}</div>
                    <div className="font-syne text-sm font-medium text-black">{value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-black/5">
              <div className="border-b border-black/5 p-4">
                <h2 className="font-syne text-sm font-semibold text-black">Artifacts</h2>
              </div>
              <div className="divide-y divide-black/5">
                {Object.entries(artifacts).map(([key, path]) => (
                  <div key={key} className="grid grid-cols-1 gap-2 p-4 md:grid-cols-[220px_1fr]">
                    <div className="font-mono text-xs text-black/45">{key}</div>
                    <div className="break-all font-mono text-xs text-black/70">{path}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </SpearShellLayout>
  )
}
