import { liteServerFetch } from "@/lib/lite-api"

export type MasterTrackerPatient = {
  id: string
  patientName: string
  dob: string | null
  procedure: string | null
  laterality: string | null
  status: "intake" | "review" | "generate" | "signed" | "billed" | "blocked"
  riskLevel: "low" | "moderate" | "high" | "blocked"
  tridentRiskScore: number | null
  payer: string | null
  revenueAtRisk: boolean
  denialProbability: number
  ocrConfidence: number
  orderDate: string | null
  providerName: string | null
  generatedDocuments: string[]
  sourceDocuments: string[]
  createdAt: string | null
  updatedAt: string | null
}

function calculateRiskLevel(patient: any): "low" | "moderate" | "high" | "blocked" {
  // Check for blockers first
  if (patient.blockers && patient.blockers.length > 0) {
    const hasBlocking = patient.blockers.some((blocker: any) => blocker.blocking)
    if (hasBlocking) return "blocked"
  }
  
  // Calculate risk based on denial probability and OCR confidence
  const denialRisk = patient.denialProbability || 0
  const ocrRisk = 1 - (patient.ocrConfidence || 1)
  
  const combinedRisk = (denialRisk * 0.7) + (ocrRisk * 0.3)
  
  if (combinedRisk > 0.7) return "high"
  if (combinedRisk > 0.4) return "moderate"
  return "low"
}

function determineStatus(patient: any): "intake" | "review" | "generate" | "signed" | "billed" | "blocked" {
  // Check if blocked first
  if (patient.blockers && patient.blockers.length > 0) {
    const hasBlocking = patient.blockers.some((blocker: any) => blocker.blocking)
    if (hasBlocking) return "blocked"
  }
  
  // Determine status based on generated documents and lifecycle
  const generated = patient.generatedDocuments || []
  const hasSwo = generated.some((doc: any) => doc.document_type === "swo")
  const hasAddendum = generated.some((doc: any) => doc.document_type === "addendum")
  const hasPod = generated.some((doc: any) => doc.document_type === "pod")
  
  // Check for signed documents (uploaded SWO indicates signature)
  const uploads = patient.sourceDocuments || []
  const hasSignedSwo = uploads.some((doc: any) => doc.category === "swo")
  
  if (hasPod) return "billed"
  if (hasSignedSwo) return "signed"
  if (hasSwo && hasAddendum) return "generate"
  if (hasSwo) return "review"
  return "intake"
}

function calculateRevenueAtRisk(patient: any): boolean {
  const denialProbability = patient.denialProbability || 0
  const ocrConfidence = patient.ocrConfidence || 1
  const riskLevel = calculateRiskLevel(patient)
  
  return denialProbability > 0.7 || ocrConfidence < 0.85 || riskLevel === "high"
}

async function fetchAllPatients(): Promise<any[]> {
  const response = await liteServerFetch("/patients")
  if (!response.ok) {
    throw new Error("Failed to fetch patients")
  }
  return response.json()
}

async function fetchPatientDetails(patientId: string): Promise<any> {
  const [patientResponse, documentsResponse, generatedResponse] = await Promise.all([
    liteServerFetch(`/patients/${patientId}`),
    liteServerFetch(`/patients/${patientId}/documents`),
    liteServerFetch(`/patients/${patientId}/generated`),
  ])

  if (!patientResponse.ok || !documentsResponse.ok || !generatedResponse.ok) {
    throw new Error(`Failed to fetch details for patient ${patientId}`)
  }

  const patient = await patientResponse.json()
  const documents = await documentsResponse.json()
  const generated = await generatedResponse.json()

  return {
    ...patient,
    sourceDocuments: documents,
    generatedDocuments: generated,
  }
}

export async function getMasterTrackerData(): Promise<MasterTrackerPatient[]> {
  try {
    // Fetch all patients
    const patients = await fetchAllPatients()
    
    // Fetch detailed information for each patient
    const detailedPatients = await Promise.all(
      patients.map(async (patient) => {
        try {
          const details = await fetchPatientDetails(patient.id)
          return details
        } catch (error) {
          console.warn(`Failed to fetch details for patient ${patient.id}:`, error)
          return { ...patient, sourceDocuments: [], generatedDocuments: [] }
        }
      })
    )

    // Transform data for master tracker
    return detailedPatients.map((patient) => {
      const status = determineStatus(patient)
      const riskLevel = calculateRiskLevel(patient)
      const revenueAtRisk = calculateRevenueAtRisk(patient)
      
      return {
        id: patient.id,
        patientName: `${patient.first_name || ""} ${patient.last_name || ""}`.trim() || "Unknown",
        dob: patient.dob,
        procedure: patient.procedure_name,
        laterality: patient.laterality,
        status,
        riskLevel,
        tridentRiskScore: null, // Will be populated by Trident engine
        payer: patient.payer_name,
        revenueAtRisk: patient.revenueAtRisk || false,
        denialProbability: patient.denialProbability || 0.5,
        ocrConfidence: patient.ocrConfidence || 0.9,
        orderDate: patient.order_date,
        providerName: patient.ordering_provider,
        generatedDocuments: patient.generatedDocuments?.map((doc: any) => doc.document_type) || [],
        sourceDocuments: patient.sourceDocuments?.map((doc: any) => doc.category) || [],
        createdAt: patient.created_at,
        updatedAt: patient.updated_at,
      }
    })
  } catch (error) {
    console.error("Failed to fetch master tracker data:", error)
    return []
  }
}

export async function updatePatientStatus(patientId: string, status: string): Promise<void> {
  // This will be used to update status when documents are signed/billed
  const response = await liteServerFetch(`/patients/${patientId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status,
      updated_at: new Date().toISOString(),
    }),
  })
  
  if (!response.ok) {
    throw new Error(`Failed to update patient status: ${response.statusText}`)
  }
}

export async function generatePatientDocument(patientId: string, documentType: string): Promise<void> {
  const response = await liteServerFetch(`/patients/${patientId}/generate/${documentType}`, {
    method: "POST",
  })
  
  if (!response.ok) {
    throw new Error(`Failed to generate ${documentType}: ${response.statusText}`)
  }
}
