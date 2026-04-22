export type ProcedureFamily = "TKA" | "THA" | "other"

export type CodeMapping = {
  product_label: string
  canonical_hcpcs: string
  alternatives: string[]
  conflict: boolean
  requires_review: boolean
  notes: string
}

export type TemplateDefinition = {
  id: string
  family: "SWO" | "ADDENDUM"
  name: string
  version: string
  procedure_family: ProcedureFamily | "generic"
  status: "active" | "draft"
}

let codeMappings: CodeMapping[] = [
  {
    product_label: "ROM Elite Knee Brace",
    canonical_hcpcs: "L1833",
    alternatives: ["L1832"],
    conflict: true,
    requires_review: true,
    notes: "Known internal conflict. Default canonical mapping is L1833 until explicitly overridden.",
  },
  {
    product_label: "ROM Knee Ice Brace",
    canonical_hcpcs: "L1832",
    alternatives: [],
    conflict: false,
    requires_review: false,
    notes: "Knee cryotherapy default bundle item.",
  },
  {
    product_label: "ROM Hip Ice Brace",
    canonical_hcpcs: "L1686",
    alternatives: [],
    conflict: false,
    requires_review: false,
    notes: "Hip cryotherapy default bundle item.",
  },
  {
    product_label: "ManaCold 2.0",
    canonical_hcpcs: "E0218",
    alternatives: [],
    conflict: false,
    requires_review: false,
    notes: "Cold therapy default bundle item.",
  },
  {
    product_label: "Walker",
    canonical_hcpcs: "E0143",
    alternatives: [],
    conflict: false,
    requires_review: false,
    notes: "Post-op mobility support default.",
  },
  {
    product_label: "Raised Seat",
    canonical_hcpcs: "E0165",
    alternatives: [],
    conflict: false,
    requires_review: false,
    notes: "Post-op transfer safety support default.",
  },
  {
    product_label: "ManaFlow DVT Device",
    canonical_hcpcs: "E0651",
    alternatives: [],
    conflict: false,
    requires_review: true,
    notes: "Requires risk justification or explicit human confirmation.",
  },
]

let templates: TemplateDefinition[] = [
  {
    id: "swo-knee-v1",
    family: "SWO",
    name: "Knee Arthroplasty SWO",
    version: "2026.04",
    procedure_family: "TKA",
    status: "active",
  },
  {
    id: "swo-hip-v1",
    family: "SWO",
    name: "Hip Arthroplasty SWO",
    version: "2026.04",
    procedure_family: "THA",
    status: "active",
  },
  {
    id: "addendum-knee-dvt-v1",
    family: "ADDENDUM",
    name: "Knee Arthroplasty DVT Addendum",
    version: "2026.04",
    procedure_family: "TKA",
    status: "active",
  },
  {
    id: "addendum-hip-dvt-v1",
    family: "ADDENDUM",
    name: "Hip Arthroplasty DVT Addendum",
    version: "2026.04",
    procedure_family: "THA",
    status: "active",
  },
  {
    id: "addendum-generic-arthroplasty-v1",
    family: "ADDENDUM",
    name: "Generic Lower-Extremity Arthroplasty Addendum",
    version: "2026.04",
    procedure_family: "generic",
    status: "active",
  },
]

export function getCodeMappings(): CodeMapping[] {
  return codeMappings
}

export function setCodeMappings(next: CodeMapping[]): CodeMapping[] {
  codeMappings = next
  return codeMappings
}

export function getTemplates(): TemplateDefinition[] {
  return templates
}

export function setTemplates(next: TemplateDefinition[]): TemplateDefinition[] {
  templates = next
  return templates
}
