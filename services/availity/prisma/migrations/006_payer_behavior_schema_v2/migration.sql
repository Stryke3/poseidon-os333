-- Payer behavior v2: rule flags, outcome dimensions, slim score snapshots.

DROP TABLE IF EXISTS "payer_score_snapshots";
DROP TABLE IF EXISTS "authorization_outcomes";
DROP TABLE IF EXISTS "payer_behavior_rules";

CREATE TABLE "payer_behavior_rules" (
    "id" TEXT NOT NULL,
    "payer_id" TEXT NOT NULL,
    "plan_name" TEXT,
    "device_category" TEXT,
    "hcpcs_code" TEXT,
    "diagnosis_code" TEXT,
    "requires_lmn" BOOLEAN NOT NULL DEFAULT false,
    "requires_swo" BOOLEAN NOT NULL DEFAULT false,
    "requires_clinicals" BOOLEAN NOT NULL DEFAULT false,
    "requires_auth" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payer_behavior_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "authorization_outcomes" (
    "id" TEXT NOT NULL,
    "case_id" TEXT,
    "payer_id" TEXT NOT NULL,
    "plan_name" TEXT,
    "device_category" TEXT,
    "hcpcs_code" TEXT,
    "diagnosis_code" TEXT,
    "physician_name" TEXT,
    "facility_name" TEXT,
    "outcome" TEXT NOT NULL,
    "denial_reason" TEXT,
    "turnaround_days" INTEGER,
    "submitted_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authorization_outcomes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payer_score_snapshots" (
    "id" TEXT NOT NULL,
    "case_id" TEXT,
    "payer_id" TEXT NOT NULL,
    "approval_probability" INTEGER NOT NULL,
    "risk_level" TEXT NOT NULL,
    "predicted_denial_reasons" JSONB NOT NULL,
    "missing_requirements" JSONB NOT NULL,
    "recommended_action" TEXT NOT NULL,
    "explanation" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payer_score_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payer_behavior_rules_payer_id_idx" ON "payer_behavior_rules"("payer_id");
CREATE INDEX "payer_behavior_rules_device_category_idx" ON "payer_behavior_rules"("device_category");
CREATE INDEX "payer_behavior_rules_hcpcs_code_idx" ON "payer_behavior_rules"("hcpcs_code");

CREATE INDEX "authorization_outcomes_payer_id_idx" ON "authorization_outcomes"("payer_id");
CREATE INDEX "authorization_outcomes_outcome_idx" ON "authorization_outcomes"("outcome");
CREATE INDEX "authorization_outcomes_device_category_idx" ON "authorization_outcomes"("device_category");
CREATE INDEX "authorization_outcomes_hcpcs_code_idx" ON "authorization_outcomes"("hcpcs_code");
CREATE INDEX "authorization_outcomes_diagnosis_code_idx" ON "authorization_outcomes"("diagnosis_code");

CREATE INDEX "payer_score_snapshots_payer_id_idx" ON "payer_score_snapshots"("payer_id");
CREATE INDEX "payer_score_snapshots_case_id_idx" ON "payer_score_snapshots"("case_id");
CREATE INDEX "payer_score_snapshots_created_at_idx" ON "payer_score_snapshots"("created_at");

ALTER TABLE "authorization_outcomes" ADD CONSTRAINT "authorization_outcomes_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "availity_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payer_score_snapshots" ADD CONSTRAINT "payer_score_snapshots_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "availity_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
