/** Doc types sent to `POST /api/trident/cases/[caseId]/generate` when the operator runs the default packet. */
export const DEFAULT_TRIDENT_GENERATE_DOC_TYPES = ["SWO", "ADDENDUM"] as const

export type TridentGenerateDocType = (typeof DEFAULT_TRIDENT_GENERATE_DOC_TYPES)[number] | "ADDENDUM"
