import type { AuthorizationOutcome } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { OutcomeScopeGroup } from "./learning.types.js";
import type { OutcomeRollup } from "./playbookPerformance.service.js";
export declare function buildPerformanceEvidenceJson(periodStart: Date, periodEnd: Date, group: Omit<OutcomeScopeGroup, "rows">, rows: AuthorizationOutcome[], rollup: OutcomeRollup): Prisma.InputJsonValue;
//# sourceMappingURL=learningEvidence.service.d.ts.map