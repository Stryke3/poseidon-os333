-- Reshape governance tables to v2 manual / recommendation / performance layout.
-- Drops existing governance-related rows (development-friendly migration).

DROP TABLE IF EXISTS "governance_drafts" CASCADE;
DROP TABLE IF EXISTS "governance_decisions" CASCADE;
ALTER TABLE "playbook_performance" DROP CONSTRAINT IF EXISTS "playbook_performance_playbook_id_fkey";
DROP TABLE IF EXISTS "governance_recommendations" CASCADE;
DROP TABLE IF EXISTS "playbook_performance" CASCADE;
DROP TABLE IF EXISTS "learned_rule_suggestions" CASCADE;
DROP TABLE IF EXISTS "manual_requirements" CASCADE;
DROP TABLE IF EXISTS "payer_manuals" CASCADE;

CREATE TABLE "payer_manuals" (
    "id" TEXT NOT NULL,
    "payer_id" TEXT NOT NULL,
    "plan_name" TEXT,
    "title" TEXT NOT NULL,
    "source_path" TEXT,
    "source_type" TEXT,
    "version_label" TEXT,
    "effective_date" TIMESTAMP(3),
    "raw_text" TEXT NOT NULL,
    "parsed_status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payer_manuals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payer_manuals_payer_id_idx" ON "payer_manuals"("payer_id");
CREATE INDEX "payer_manuals_plan_name_idx" ON "payer_manuals"("plan_name");

CREATE TABLE "manual_requirements" (
    "id" TEXT NOT NULL,
    "manual_id" TEXT NOT NULL,
    "payer_id" TEXT NOT NULL,
    "plan_name" TEXT,
    "device_category" TEXT,
    "hcpcs_code" TEXT,
    "diagnosis_code" TEXT,
    "requirement_type" TEXT NOT NULL,
    "requirement_key" TEXT NOT NULL,
    "requirement_value" TEXT NOT NULL,
    "source_excerpt" TEXT,
    "confidence" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "manual_requirements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "manual_requirements_manual_id_idx" ON "manual_requirements"("manual_id");
CREATE INDEX "manual_requirements_payer_id_idx" ON "manual_requirements"("payer_id");
CREATE INDEX "manual_requirements_hcpcs_code_idx" ON "manual_requirements"("hcpcs_code");
CREATE INDEX "manual_requirements_diagnosis_code_idx" ON "manual_requirements"("diagnosis_code");
ALTER TABLE "manual_requirements" ADD CONSTRAINT "manual_requirements_manual_id_fkey" FOREIGN KEY ("manual_id") REFERENCES "payer_manuals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "learned_rule_suggestions" (
    "id" TEXT NOT NULL,
    "payer_id" TEXT NOT NULL,
    "plan_name" TEXT,
    "device_category" TEXT,
    "hcpcs_code" TEXT,
    "diagnosis_code" TEXT,
    "suggestion_type" TEXT NOT NULL,
    "suggestion_key" TEXT NOT NULL,
    "suggestion_value" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "learned_rule_suggestions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "learned_rule_suggestions_payer_id_idx" ON "learned_rule_suggestions"("payer_id");
CREATE INDEX "learned_rule_suggestions_status_idx" ON "learned_rule_suggestions"("status");

CREATE TABLE "playbook_performance" (
    "id" TEXT NOT NULL,
    "playbook_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "payer_id" TEXT NOT NULL,
    "plan_name" TEXT,
    "device_category" TEXT,
    "hcpcs_code" TEXT,
    "diagnosis_code" TEXT,
    "total_cases" INTEGER NOT NULL DEFAULT 0,
    "approvals" INTEGER NOT NULL DEFAULT 0,
    "denials" INTEGER NOT NULL DEFAULT 0,
    "pended" INTEGER NOT NULL DEFAULT 0,
    "avg_turnaround_days" DOUBLE PRECISION,
    "rework_count" INTEGER NOT NULL DEFAULT 0,
    "denial_reasons" JSONB NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "playbook_performance_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "playbook_performance_playbook_id_idx" ON "playbook_performance"("playbook_id");
CREATE INDEX "playbook_performance_payer_id_idx" ON "playbook_performance"("payer_id");

CREATE TABLE "governance_recommendations" (
    "id" TEXT NOT NULL,
    "payer_id" TEXT NOT NULL,
    "recommendation_type" TEXT NOT NULL,
    "target_id" TEXT,
    "target_type" TEXT,
    "draft_payload" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "governance_recommendations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "governance_recommendations_payer_id_idx" ON "governance_recommendations"("payer_id");
CREATE INDEX "governance_recommendations_status_idx" ON "governance_recommendations"("status");

CREATE TABLE "governance_decisions" (
    "id" TEXT NOT NULL,
    "governance_recommendation_id" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "decided_by" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "governance_decisions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "governance_decisions_governance_recommendation_id_idx" ON "governance_decisions"("governance_recommendation_id");
ALTER TABLE "governance_decisions" ADD CONSTRAINT "governance_decisions_governance_recommendation_id_fkey" FOREIGN KEY ("governance_recommendation_id") REFERENCES "governance_recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "governance_drafts" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payer_id" TEXT NOT NULL,
    "governance_recommendation_id" TEXT,
    "title" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "governance_drafts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "governance_drafts_payer_id_idx" ON "governance_drafts"("payer_id");
CREATE INDEX "governance_drafts_kind_idx" ON "governance_drafts"("kind");
CREATE INDEX "governance_drafts_status_idx" ON "governance_drafts"("status");
CREATE INDEX "governance_drafts_governance_recommendation_id_idx" ON "governance_drafts"("governance_recommendation_id");
ALTER TABLE "governance_drafts" ADD CONSTRAINT "governance_drafts_governance_recommendation_id_fkey" FOREIGN KEY ("governance_recommendation_id") REFERENCES "governance_recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
