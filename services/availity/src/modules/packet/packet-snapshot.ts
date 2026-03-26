import { createHash } from "node:crypto";
import type { Case } from "@prisma/client";
import { formatDateToYmd } from "../../lib/dob.js";
import type {
  ClinicalDeviceInput,
  PacketClinicalInput,
  PacketGenerationSnapshot,
} from "../../types/packet.js";
import { PACKET_SCHEMA_VERSION } from "../../types/packet.js";
import { resolvePayerRules } from "./payer-rules.js";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
}

export function hashSnapshot(snapshot: PacketGenerationSnapshot): string {
  return createHash("sha256").update(stableStringify(snapshot)).digest("hex");
}

export function buildPacketGenerationSnapshot(
  caseRow: Case,
  clinical: PacketClinicalInput,
): PacketGenerationSnapshot {
  const hints = resolvePayerRules(
    caseRow.payerId,
    clinical.payerRuleProfileId,
  );

  const diagnosisCodesJoined = clinical.diagnosis.map((d) => d.code).join(", ");

  const diagnosisLinesJoined =
    clinical.diagnosis.length === 0
      ? "[No diagnosis entries were supplied.]"
      : clinical.diagnosis
          .map((d) =>
            d.description
              ? `${d.code} — ${d.description}`
              : `${d.code} (no description entered)`,
          )
          .join("\n");

  const clinicalSummaryBlock =
    clinical.clinicalSummaryLines && clinical.clinicalSummaryLines.length > 0
      ? clinical.clinicalSummaryLines.join("\n")
      : "[No user-entered clinical summary lines were supplied for this packet.]";

  const attachmentManifestLines =
    clinical.attachmentMetadata && clinical.attachmentMetadata.length > 0
      ? clinical.attachmentMetadata
          .map(
            (a) =>
              `- id=${a.id} label=${a.label}${a.mimeType ? ` mimeType=${a.mimeType}` : ""}`,
          )
          .join("\n")
      : "[No attachment metadata records were supplied.]";

  const snapshot: PacketGenerationSnapshot = {
    schemaVersion: PACKET_SCHEMA_VERSION,
    case: {
      id: caseRow.id,
      patientFirstName: caseRow.patientFirstName,
      patientLastName: caseRow.patientLastName,
      dob: formatDateToYmd(caseRow.dob),
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

function formatDeviceDescription(device: ClinicalDeviceInput): string {
  const parts: string[] = [device.category];
  if (device.manufacturer) parts.push(device.manufacturer);
  if (device.model) parts.push(device.model);
  if (device.quantity != null) parts.push(`quantity ${device.quantity}`);
  return parts.join(" — ");
}

/**
 * Flat keys for `LMN_TEMPLATE` / `SWO_TEMPLATE` ({{patientName}}, {{device}}, etc.).
 * Missing optional clinical strings surface as explicit template markers via the template engine.
 */
export function flatTemplateFieldsFromSnapshot(
  snapshot: PacketGenerationSnapshot,
): Record<string, unknown> {
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

export function snapshotToRenderContext(
  snapshot: PacketGenerationSnapshot,
): Record<string, unknown> {
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
