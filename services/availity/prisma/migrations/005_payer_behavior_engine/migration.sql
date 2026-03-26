-- Payer behavior engine: rules, outcomes, score snapshots, audit.

CREATE TABLE "payer_behavior_rules" (
    "id" TEXT NOT NULL,
    "payer_id" TEXT NOT NULL,
    "plan_id" TEXT,
    "rule_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "condition_json" JSONB,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "blocks_submit" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payer_behavior_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "authorization_outcomes" (
    "id" TEXT NOT NULL,
    "case_id" TEXT,
    "packet_id" TEXT,
    "payer_id" TEXT NOT NULL,
    "plan_id" TEXT,
    "device_category" TEXT,
    "hcpcs" TEXT,
    "diagnosis_codes" JSONB NOT NULL DEFAULT '[]',
    "physician_npi" TEXT,
    "facility_id" TEXT,
    "result" TEXT NOT NULL,
    "denial_reason" TEXT,
    "turnaround_days" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authorization_outcomes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payer_score_snapshots" (
    "id" TEXT NOT NULL,
    "case_id" TEXT,
    "packet_id" TEXT,
    "payer_id" TEXT NOT NULL,
    "input_snapshot" JSONB NOT NULL,
    "approval_probability" INTEGER NOT NULL,
    "risk_level" TEXT NOT NULL,
    "predicted_denial_reasons" JSONB NOT NULL,
    "missing_requirements" JSONB NOT NULL,
    "recommended_action" TEXT NOT NULL,
    "explanations" JSONB NOT NULL,
    "confidence_note" TEXT,
    "block_submission" BOOLEAN NOT NULL DEFAULT false,
    "actor" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payer_score_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payer_intelligence_audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payer_id" TEXT,
    "case_id" TEXT,
    "snapshot_id" TEXT,
    "outcome_id" TEXT,
    "detail_json" JSONB,
    "actor" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payer_intelligence_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payer_behavior_rules_payer_id_idx" ON "payer_behavior_rules"("payer_id");
CREATE INDEX "payer_behavior_rules_payer_id_plan_id_idx" ON "payer_behavior_rules"("payer_id", "plan_id");
CREATE INDEX "payer_behavior_rules_rule_type_idx" ON "payer_behavior_rules"("rule_type");

CREATE INDEX "authorization_outcomes_payer_id_idx" ON "authorization_outcomes"("payer_id");
CREATE INDEX "authorization_outcomes_payer_id_hcpcs_idx" ON "authorization_outcomes"("payer_id", "hcpcs");
CREATE INDEX "authorization_outcomes_case_id_idx" ON "authorization_outcomes"("case_id");

CREATE INDEX "payer_score_snapshots_payer_id_idx" ON "payer_score_snapshots"("payer_id");
CREATE INDEX "payer_score_snapshots_case_id_idx" ON "payer_score_snapshots"("case_id");
CREATE INDEX "payer_score_snapshots_created_at_idx" ON "payer_score_snapshots"("created_at");

CREATE INDEX "payer_intelligence_audit_logs_payer_id_idx" ON "payer_intelligence_audit_logs"("payer_id");
CREATE INDEX "payer_intelligence_audit_logs_action_idx" ON "payer_intelligence_audit_logs"("action");

ALTER TABLE "authorization_outcomes" ADD CONSTRAINT "authorization_outcomes_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "availity_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payer_score_snapshots" ADD CONSTRAINT "payer_score_snapshots_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "availity_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
