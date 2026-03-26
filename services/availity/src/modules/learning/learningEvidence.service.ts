import type { AuthorizationOutcome } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { OutcomeScopeGroup } from "./learning.types.js";
import type { OutcomeRollup } from "./playbookPerformance.service.js";

export function buildPerformanceEvidenceJson(
  periodStart: Date,
  periodEnd: Date,
  group: Omit<OutcomeScopeGroup, "rows">,
  rows: AuthorizationOutcome[],
  rollup: OutcomeRollup,
): Prisma.InputJsonValue {
  const sample = rows.length;

  const scoreSnapshotIds = new Set<string>();
  const manualRequirementIdsInForce = new Set<string>();
  for (const r of rows) {
    const snapshot = (r.payerRuleSnapshot ?? {}) as any;
    const scoreSnapshotId = snapshot?.scoreSnapshotId;
    if (typeof scoreSnapshotId === "string" && scoreSnapshotId.trim()) {
      scoreSnapshotIds.add(scoreSnapshotId.trim());
    }

    const manualIds = snapshot?.manualRequirementIdsInForce;
    if (Array.isArray(manualIds)) {
      for (const id of manualIds) {
        if (typeof id === "string" && id.trim()) manualRequirementIdsInForce.add(id.trim());
      }
    }
  }

  return {
    performancePeriod: { start: periodStart.toISOString(), end: periodEnd.toISOString() },
    totalCases: sample,
    approvals: rollup.approvals,
    denials: rollup.denials,
    pended: rollup.pended,
    playbookId: group.playbookId,
    playbookVersion: group.playbookVersion,
    scope: {
      payerId: group.payerId,
      planName: group.planName,
      deviceCategory: group.deviceCategory,
      hcpcsCode: group.hcpcsCode,
      diagnosisCode: group.diagnosisCode,
    },
    denialReasonTop: Object.entries(rollup.denialReasons).sort((a, b) => b[1] - a[1])[0] ?? null,
    outcomeIds: rows.map((r) => r.id).slice(0, 200),
    references: {
      outcomeIds: rows.map((r) => r.id).slice(0, 200),
      scoreSnapshotIds: [...scoreSnapshotIds],
      manualRequirementIdsInForce: [...manualRequirementIdsInForce],
    },
  };
}
