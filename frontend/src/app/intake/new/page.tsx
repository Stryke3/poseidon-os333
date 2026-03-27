import Link from "next/link"

import {
  HeroPanel,
  PageShell,
  SectionCard,
} from "@/components/dashboard/DashboardPrimitives"
import PatientIntakeForm from "@/components/intake/PatientIntakeForm"

export default function NewPatientIntakePage() {
  return (
    <PageShell>
      <HeroPanel
        eyebrow="Basic Front-End Intake"
        title="Patient Intake"
        description="Simple intake only: add patient, code ICD-10 and HCPCS/device order, upload docs, and create a tracked intake order."
        actions={
          <Link
            href="/intake"
            className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-accent-blue/40 hover:text-white"
          >
            Back to Intake
          </Link>
        }
      />

      <div className="mt-6">
        <SectionCard>
          <PatientIntakeForm />
        </SectionCard>
      </div>
    </PageShell>
  )
}
