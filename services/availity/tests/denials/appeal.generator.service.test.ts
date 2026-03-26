import { describe, expect, it } from "vitest";
import { generateAppealDraft } from "../../src/modules/denials/appeal.generator.service.js";
import type { DenialClassificationResult, DenialEventPayload, DenialCategory, RecoveryType } from "../../src/modules/denials/denial.types.js";

describe("appeal.generator.service", () => {
  it("includes denial reason and uses provided packet document excerpts", () => {
    const denial: DenialEventPayload = {
      id: "den_1",
      caseId: "case_1",
      payerId: "payer_1",
      denialCode: "X123",
      denialReasonText: "Missing documentation for the requested authorization.",
      denialCategory: null,
      packetId: "packet_1",
      playbookId: null,
      playbookVersion: null,
      scoreSnapshotId: null,
    };

    const classification: DenialClassificationResult = {
      category: "MISSING_DOCUMENTATION",
      confidence: 0.9,
      recoveryType: "RESUBMIT",
      requiredFixes: ["Add the missing documents."],
      requiredAttachments: ["LMN", "SWO"],
      escalationSteps: ["Review evidence."],
      explanation: ["deterministic"],
    };

    const packetDocs = [
      { type: "LMN", content: "LMN excerpt: Patient needs device due to clinical criteria." },
      { type: "SWO", content: "SWO excerpt: Signed order submitted with diagnosis support." },
    ];

    const out = generateAppealDraft({ denial, classification, packetDocs });

    expect(out.letterText).toContain("DenialReason:");
    expect(out.letterText).toContain(denial.denialReasonText);
    expect(out.letterText).toContain("LMN excerpt:");
    expect(out.letterText).toContain("SWO excerpt:");
  });

  it("does not include excerpts for attachment types that were not provided", () => {
    const denial: DenialEventPayload = {
      id: "den_2",
      caseId: null,
      payerId: "payer_1",
      denialCode: null,
      denialReasonText: "Not medically necessary based on insufficient clinical information.",
      denialCategory: null,
      packetId: null,
      playbookId: null,
      playbookVersion: null,
      scoreSnapshotId: null,
    };

    const classification: DenialClassificationResult = {
      category: "MEDICAL_NECESSITY",
      confidence: 0.8,
      recoveryType: "APPEAL",
      requiredFixes: ["Strengthen rebuttal."],
      requiredAttachments: ["LMN", "CLINICAL_SUMMARY"],
      escalationSteps: ["Review evidence."],
      explanation: ["deterministic"],
    };

    const packetDocs = [
      { type: "LMN", content: "LMN only excerpt: criteria for medical necessity." },
      // No CLINICAL_SUMMARY provided
    ];

    const out = generateAppealDraft({ denial, classification, packetDocs });
    expect(out.letterText).toContain("LMN excerpt:");
    expect(out.letterText).not.toContain("CLINICAL_SUMMARY excerpt:");
  });

  it("is deterministic given identical inputs", () => {
    const denial: DenialEventPayload = {
      id: "den_3",
      caseId: "case_3",
      payerId: "payer_1",
      denialCode: "Z999",
      denialReasonText: "Coding mismatch between submitted and required diagnosis information.",
      denialCategory: null,
      packetId: null,
      playbookId: null,
      playbookVersion: null,
      scoreSnapshotId: null,
    };

    const classification: DenialClassificationResult = {
      category: "CODING_MISMATCH",
      confidence: 0.87,
      recoveryType: "RESUBMIT",
      requiredFixes: ["Verify coding consistency."],
      requiredAttachments: ["SWO"],
      escalationSteps: ["Review evidence."],
      explanation: ["deterministic"],
    };

    const packetDocs = [{ type: "SWO", content: "SWO excerpt: HCPCS submitted with diagnosis support." }];

    const out1 = generateAppealDraft({ denial, classification, packetDocs });
    const out2 = generateAppealDraft({ denial, classification, packetDocs });
    expect(out1).toEqual(out2);
  });
});

