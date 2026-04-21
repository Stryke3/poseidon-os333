import Link from "next/link"

import { CreatePatientForm } from "@/components/lite/CreatePatientForm"
import { liteServerFetch } from "@/lib/lite-api"

export const dynamic = "force-dynamic"

type PatientRow = {
  id: string
  first_name: string
  last_name: string
  dob: string | null
  phone: string | null
  email: string | null
  updated_at: string | null
}

export default async function LitePatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""
  const res = await liteServerFetch(`/patients${qs}`)
  let patients: PatientRow[] = []
  if (res.ok) {
    try {
      patients = await res.json()
    } catch {
      patients = []
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Patients</h1>
        <p className="mt-1 text-sm text-slate-600">
          Search the repository or create a new patient record.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end">
        <form className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center" action="/lite/patients" method="get">
          <label className="text-sm font-medium text-slate-700">Search</label>
          <input
            name="q"
            defaultValue={q || ""}
            placeholder="Name, email, phone, member ID"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <button
            type="submit"
            className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200"
          >
            Search
          </button>
        </form>
        <CreatePatientForm />
      </div>

      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white shadow-sm">
        {patients.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-slate-500">No patients yet.</li>
        ) : (
          patients.map((p) => (
            <li key={p.id}>
              <Link
                href={`/lite/patients/${p.id}`}
                className="flex flex-col gap-1 px-4 py-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-medium text-slate-900">
                  {p.first_name} {p.last_name}
                </span>
                <span className="text-sm text-slate-500">
                  {p.dob ? `DOB ${p.dob}` : "—"}
                  {p.phone ? ` · ${p.phone}` : ""}
                  {p.email ? ` · ${p.email}` : ""}
                </span>
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
