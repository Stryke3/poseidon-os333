/**
 * Prior authorization packet types. All clinical/device statements must originate from
 * user-supplied `clinical` input or case facts — templates never invent medical facts.
 */
export declare const PACKET_SCHEMA_VERSION: "1.0";
export type PacketDocumentType = "LMN" | "SWO" | "CLINICAL_SUMMARY" | "ATTACHMENTS_METADATA";
export type ClinicalDiagnosisInput = {
    code: string;
    /** Optional; must be entered by user — not auto-filled from code lists here. */
    description?: string;
};
export type ClinicalDeviceInput = {
    category: string;
    hcpcs?: string;
    manufacturer?: string;
    model?: string;
    quantity?: number;
};
export type ClinicalPhysicianInput = {
    name: string;
    npi?: string;
    practice?: string;
};
export type AttachmentMetadataInput = {
    id: string;
    label: string;
    mimeType?: string;
};
/** Payload supplied by the caller; every narrative line must come from these fields or case demographics. */
export type PacketClinicalInput = {
    diagnosis: ClinicalDiagnosisInput[];
    device: ClinicalDeviceInput;
    physician: ClinicalPhysicianInput;
    /** Provider-entered lines only; echoed verbatim in clinical summary. */
    clinicalSummaryLines?: string[];
    /** User-entered text for LMN `clinicalJustification` placeholder — not auto-generated. */
    clinicalJustification?: string;
    /** User-entered functional limitations narrative for LMN. */
    limitations?: string;
    /** User-entered prior treatment / failed treatment narrative for LMN. */
    failedTreatments?: string;
    /** SWO order date (YYYY-MM-DD); must be supplied by user when required for compliance. */
    orderDate?: string;
    additionalNotes?: string;
    attachmentMetadata?: AttachmentMetadataInput[];
    /** Selects payer rule hints when present (see payer-rules). */
    payerRuleProfileId?: string;
};
export type PayerRuleHints = {
    profileId: string;
    requiredAttachmentLabels: string[];
    notesForPacket: string[];
};
/** Canonical snapshot stored per generation (immutable). */
export type PacketGenerationSnapshot = {
    schemaVersion: typeof PACKET_SCHEMA_VERSION;
    case: {
        id: string;
        patientFirstName: string;
        patientLastName: string;
        dob: string;
        memberId: string;
        payerId: string;
    };
    clinical: PacketClinicalInput;
    derived: {
        diagnosisCodesJoined: string;
        diagnosisLinesJoined: string;
        clinicalSummaryBlock: string;
        attachmentManifestLines: string;
    };
    /** Pre-formatted strings for templates (payer hints are not clinical facts). */
    payerRules?: {
        profileId: string;
        requiredAttachmentLabels: string;
        notesForPacket: string;
    };
};
export type PacketDocumentOutput = {
    type: PacketDocumentType;
    templateId: string;
    docVersion: number;
    renderedText: string;
    /** Maps each template placeholder key to the snapshot JSON path that supplied the value. */
    provenance: Record<string, string>;
};
/** Stored on `PriorAuthPacket.documents` — references `PriorAuthDocument` rows. */
export type PacketDocumentsRefJson = {
    documentIds: string[];
};
/** Stored on `PriorAuthPacket.payload` — generation metadata + trace (hydrate full text from documents). */
export type PacketPayloadStoredJson = {
    schemaVersion: typeof PACKET_SCHEMA_VERSION;
    generationVersion: number;
    snapshotHash: string;
    deviceType: string;
    traceabilityNote: string;
};
export type PriorAuthPacketJson = {
    schemaVersion: typeof PACKET_SCHEMA_VERSION;
    packetId: string;
    caseId: string;
    status: string;
    deviceType: string | null;
    generatedAt: string;
    documentIds: string[];
    snapshotHash: string | null;
    generationVersion: number;
    documents: PacketDocumentOutput[];
    documentsByType: Partial<Record<PacketDocumentType, PacketDocumentOutput>>;
    traceabilityNote: string;
};
export type PacketTemplateDefinition = {
    id: string;
    docType: PacketDocumentType;
    body: string;
};
export type DeviceTemplateSet = {
    deviceTypeKey: string;
    templates: PacketTemplateDefinition[];
};
//# sourceMappingURL=packet.d.ts.map