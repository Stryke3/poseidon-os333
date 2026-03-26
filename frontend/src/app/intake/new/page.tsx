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
        eyebrow="Manual Intake"
        title="New Patient"
        description="Create a new patient record manually or drop a referral PDF to auto-fill fields."
        actions={
          <Link
            href="/intake"
            className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-accent-blue/40 hover:text-white"
          >
            Back to Intake Board
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
