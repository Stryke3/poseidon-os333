"use client"

import { useCallback, useState } from "react"

import { submitClaim, validateClaim } from "@/lib/edi-api"

type ValidationResult = {
  valid: boolean
  errors?: string[]
  claim_number?: string
  total_charge?: string
  service_lines?: number
  diagnosis_codes?: number
  payer?: string
}

type SubmissionResult = {
  status: string
  submission_id?: string
  icn?: string
  message?: string
  errors?: string[]
}

interface ClaimActionsProps {
  orderId: string
  orderStatus?: string
  billingStatus?: string
}

export default function ClaimActions({ orderId, orderStatus, billingStatus }: ClaimActionsProps) {
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState<"validate" | "submit" | null>(null)
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [submission, setSubmission] = useState<SubmissionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleValidate = useCallback(async () => {
    setLoading(true)
    setAction("validate")
    setError(null)
    setValidation(null)
    setSubmission(null)
    try {
      const result = await validateClaim(orderId)
      setValidation(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Validation failed")
    } finally {
      setLoading(false)
    }
  }, [orderId])

  const handleSubmit = useCallback(async () => {
    setLoading(true)
    setAction("submit")
    setError(null)
    setSubmission(null)
    try {
      const result = await submitClaim(orderId)
      setSubmission(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed")
    } finally {
      setLoading(false)
    }
  }, [orderId])

  return (
    <div className="mt-3 rounded-xl border border-accent-blue/20 bg-accent-blue/[0.06] p-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-accent-blue">837P Claim Actions</p>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleValidate}
          disabled={loading}
          className="rounded-full border border-accent-blue/30 bg-accent-blue/10 px-3 py-1.5 text-[11px] font-semibold text-accent-blue transition hover:bg-accent-blue/20 disabled:opacity-50"
        >
          {loading && action === "validate" ? "Validating\u2026" : "Validate claim"}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="rounded-full border border-accent-green/30 bg-accent-green/10 px-3 py-1.5 text-[11px] font-semibold text-accent-green transition hover:bg-accent-green/20 disabled:opacity-50"
        >
          {loading && action === "submit" ? "Submitting\u2026" : "Submit 837P"}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs text-accent-red">{error}</p>
      )}

      {validation && (
        <div className={`mt-2 rounded-lg border p-2.5 text-xs ${
          validation.valid
            ? "border-accent-green/30 bg-accent-green/10 text-accent-green"
            : "border-accent-red/30 bg-accent-red/10 text-accent-red"
        }`}>
          <p className="font-semibold">{validation.valid ? "Valid — ready to submit" : "Validation failed"}</p>
          {validation.claim_number && <p className="mt-1 text-slate-300">Claim #: {validation.claim_number}</p>}
          {validation.payer && <p className="text-slate-300">Payer: {validation.payer}</p>}
          {validation.total_charge && <p className="text-slate-300">Total charge: {validation.total_charge}</p>}
          {validation.service_lines != null && <p className="text-slate-300">Service lines: {validation.service_lines} · Dx codes: {validation.diagnosis_codes}</p>}
          {validation.errors && validation.errors.length > 0 && (
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-accent-red">
              {validation.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}

      {submission && (
        <div className={`mt-2 rounded-lg border p-2.5 text-xs ${
          submission.status === "submitted" || submission.status === "accepted"
            ? "border-accent-green/30 bg-accent-green/10 text-accent-green"
            : "border-accent-red/30 bg-accent-red/10 text-accent-red"
        }`}>
          <p className="font-semibold">
            {submission.status === "submitted" || submission.status === "accepted"
              ? "Claim submitted"
              : `Status: ${submission.status}`}
          </p>
          {submission.submission_id && <p className="mt-1 text-slate-300">Submission ID: {submission.submission_id}</p>}
          {submission.icn && <p className="text-slate-300">ICN: {submission.icn}</p>}
          {submission.message && <p className="text-slate-300">{submission.message}</p>}
          {submission.errors && submission.errors.length > 0 && (
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-accent-red">
              {submission.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
