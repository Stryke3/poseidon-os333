import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Poseidon Lite — Patient repository",
  description: "Patient records and compliance documents",
}

export default function LiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/lite/patients" className="font-semibold text-slate-800">
              Poseidon Lite
            </Link>
            <span className="text-sm text-slate-500">Patient repository · Compliance documents</span>
          </div>
          <Link
            href="/lite/patients"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
          >
            Patients
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  )
}
