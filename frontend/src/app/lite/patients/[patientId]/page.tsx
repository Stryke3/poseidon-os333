import { notFound } from "next/navigation"

import { PatientLiteRepository } from "@/components/lite/PatientLiteRepository"
import { liteServerFetch } from "@/lib/lite-api"

export const dynamic = "force-dynamic"

export default async function LitePatientDetailPage({
  params,
}: {
  params: Promise<{ patientId: string }>
}) {
  const { patientId } = await params
  const [pr, ur, gr] = await Promise.all([
    liteServerFetch(`/patients/${patientId}`),
    liteServerFetch(`/patients/${patientId}/documents`),
    liteServerFetch(`/patients/${patientId}/generated`),
  ])
  if (!pr.ok) notFound()
  const patient = await pr.json()
  const uploads = ur.ok ? await ur.json() : []
  const generated = gr.ok ? await gr.json() : []

  return <PatientLiteRepository patient={patient} uploads={uploads} generated={generated} />
}
