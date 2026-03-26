export type DenialIntakeInput = {
  caseId?: string;
  payerId: string;
  planName?: string;
  authId?: string;
  denialCode?: string;
  denialReasonText: string;
  packetId?: string;
  playbookId?: string;
  playbookVersion?: number;
  scoreSnapshotId?: string;
};

export type DenialCategory =
  | "MISSING_DOCUMENTATION"
  | "MEDICAL_NECESSITY"
  | "NON_COVERED_SERVICE"
  | "TIMELY_FILING"
  | "ELIGIBILITY"
  | "CODING_MISMATCH"
  | "DUPLICATE"
  | "ADMINISTRATIVE_DEFECT"
  | "OTHER";

export type RecoveryType =
  | "RESUBMIT"
  | "APPEAL"
  | "PEER_TO_PEER"
  | "ABANDON"
  | "REVIEW";

export type DenialClassificationResult = {
  category: DenialCategory;
  confidence: number;
  recoveryType: RecoveryType;
  requiredFixes: string[];
  requiredAttachments: string[];
  escalationSteps: string[];
  explanation: string[];
};

export type DenialEventPayload = {
  id: string;
  caseId: string | null;
  payerId: string;
  denialCode: string | null;
  denialReasonText: string;
  denialCategory: string | null;
  packetId: string | null;
  playbookId: string | null;
  playbookVersion: number | null;
  scoreSnapshotId: string | null;
};

