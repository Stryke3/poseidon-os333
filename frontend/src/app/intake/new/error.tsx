"use client"

import Link from "next/link"

export default function NewIntakeError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col justify-center gap-4 px-4 py-16 text-center">
      <p className="text-sm font-semibold text-slate-200">Intake form couldn&apos;t load</p>
      <p className="text-xs text-slate-500">{error.message || "Unknown error"}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white hover:bg-white/5"
          onClick={() => reset()}
          type="button"
        >
          Try again
        </button>
        <Link className="rounded-full border border-emerald-500/30 px-4 py-2 text-xs font-semibold text-emerald-200" href="/login">
          Sign in again
        </Link>
        <Link className="rounded-full border border-white/10 px-4 py-2 text-xs text-slate-400" href="/intake">
          Back to Intake
        </Link>
      </div>
    </div>
  )
}
