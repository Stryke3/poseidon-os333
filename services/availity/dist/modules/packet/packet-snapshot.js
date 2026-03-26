"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashSnapshot = hashSnapshot;
exports.buildPacketGenerationSnapshot = buildPacketGenerationSnapshot;
exports.flatTemplateFieldsFromSnapshot = flatTemplateFieldsFromSnapshot;
exports.snapshotToRenderContext = snapshotToRenderContext;
const node_crypto_1 = require("node:crypto");
const dob_js_1 = require("../../lib/dob.js");
const packet_js_1 = require("../../types/packet.js");
const payer_rules_js_1 = require("./payer-rules.js");
function stableStringify(value) {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(",")}]`;
    }
    const o = value;
    const keys = Object.keys(o).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
}
function hashSnapshot(snapshot) {
    return (0, node_crypto_1.createHash)("sha256").update(stableStringify(snapshot)).digest("hex");
}
function buildPacketGenerationSnapshot(caseRow, clinical) {
    const hints = (0, payer_rules_js_1.resolvePayerRules)(caseRow.payerId, clinical.payerRuleProfileId);
    const diagnosisCodesJoined = clinical.diagnosis.map((d) => d.code).join(", ");
    const diagnosisLinesJoined = clinical.diagnosis.length === 0
        ? "[No diagnosis entries were supplied.]"
        : clinical.diagnosis
            .map((d) => d.description
            ? `${d.code} — ${d.description}`
            : `${d.code} (no description entered)`)
            .join("\n");
    const clinicalSummaryBlock = clinical.clinicalSummaryLines && clinical.clinicalSummaryLines.length > 0
        ? clinical.clinicalSummaryLines.join("\n")
        : "[No user-entered clinical summary lines were supplied for this packet.]";
    const attachmentManifestLines = clinical.attachmentMetadata && clinical.attachmentMetadata.length > 0
        ? clinical.attachmentMetadata
            .map((a) => `- id=${a.id} label=${a.label}${a.mimeType ? ` mimeType=${a.mimeType}` : ""}`)
            .join("\n")
        : "[No attachment metadata records were supplied.]";
    const snapshot = {
        schemaVersion: packet_js_1.PACKET_SCHEMA_VERSION,
        case: {
            id: caseRow.id,
            patientFirstName: caseRow.patientFirstName,
            patientLastName: caseRow.patientLastName,
            dob: (0, dob_js_1.formatDateToYmd)(caseRow.dob),
            memberId: caseRow.memberId,
            payerId: caseRow.payerId,
        },
        clinical,
        derived: {
            diagnosisCodesJoined,
            diagnosisLinesJoined,
            clinicalSummaryBlock,
            attachmentManifestLines,
        },
        payerRules: {
            profileId: hints.profileId,
            requiredAttachmentLabels: hints.requiredAttachmentLabels
                .map((x) => `- ${x}`)
                .join("\n"),
            notesForPacket: hints.notesForPacket.join("\n"),
        },
    };
    return snapshot;
}
function formatDeviceDescription(device) {
    const parts = [device.category];
    if (device.manufacturer)
        parts.push(device.manufacturer);
    if (device.model)
        parts.push(device.model);
    if (device.quantity != null)
        parts.push(`quantity ${device.quantity}`);
    return parts.join(" — ");
}
/**
 * Flat keys for `LMN_TEMPLATE` / `SWO_TEMPLATE` ({{patientName}}, {{device}}, etc.).
 * Missing optional clinical strings surface as explicit template markers via the template engine.
 */
function flatTemplateFieldsFromSnapshot(snapshot) {
    const c = snapshot.case;
    const cl = snapshot.clinical;
    const d = snapshot.derived;
    return {
        patientName: `${c.patientFirstName} ${c.patientLastName}`.trim(),
        dob: c.dob,
        diagnosis: d.diagnosisLinesJoined,
        device: formatDeviceDescription(cl.device),
        clinicalJustification: cl.clinicalJustification,
        limitations: cl.limitations,
        failedTreatments: cl.failedTreatments,
        physicianName: cl.physician.name,
        npi: cl.physician.npi,
        hcpcs: cl.device.hcpcs,
        orderDate: cl.orderDate,
    };
}
function snapshotToRenderContext(snapshot) {
    return {
        case: snapshot.case,
        clinical: snapshot.clinical,
        derived: snapshot.derived,
        payerRules: snapshot.payerRules ?? {
            profileId: "default",
            requiredAttachmentLabels: "",
            notesForPacket: "",
        },
        ...flatTemplateFieldsFromSnapshot(snapshot),
    };
}
//# sourceMappingURL=packet-snapshot.js.map