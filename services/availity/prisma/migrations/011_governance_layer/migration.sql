-- Outcome correlation (playbook + rule context)
ALTER TABLE "authorization_outcomes" ADD COLUMN "playbook_execution_id" TEXT,
ADD COLUMN "playbook_id" TEXT,
ADD COLUMN "playbook_version" INTEGER,
ADD COLUMN "payer_rule_snapshot" JSONB;

CREATE INDEX "authorization_outcomes_playbook_execution_id_idx" ON "authorization_outcomes"("playbook_execution_id");
CREATE INDEX "authorization_outcomes_playbook_id_idx" ON "authorization_outcomes"("playbook_id");

ALTER TABLE "authorization_outcomes" ADD CONSTRAINT "authorization_outcomes_playbook_execution_id_fkey" FOREIGN KEY ("playbook_execution_id") REFERENCES "playbook_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Manual storage + baseline extraction rows
CREATE TABLE "payer_manuals" (
    "id" TEXT NOT NULL,
    "payer_id" TEXT NOT NULL,
    "title" TEXT,
    "source_path" TEXT NOT NULL,
    "raw_text" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payer_manuals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payer_manuals_payer_id_idx" ON "payer_manuals"("payer_id");
CREATE INDEX "payer_manuals_checksum_idx" ON "payer_manuals"("checksum");

CREATE TABLE "manual_requirements" (
    "id" TEXT NOT NULL,
    "manual_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "structured" JSONB NOT NULL,
    "source_quote" TEXT NOT NULL,
    "source_start" INTEGER,
    "source_end" INTEGER,
    "confidence" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_requirements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "manual_requirements_manual_id_idx" ON "manual_requirements"("manual_id");
CREATE INDEX "manual_requirements_category_idx" ON "manual_requirements"("category");

ALTER TABLE "manual_requirements" ADD CONSTRAINT "manual_requirements_manual_id_fkey" FOREIGN KEY ("manual_id") REFERENCES "payer_manuals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "learned_rule_suggestions" (
    "id" TEXT NOT NULL,
    "payer_id" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "suggestion_type" TEXT NOT NULL,
    "proposed_rule" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learned_rule_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "learned_rule_suggestions_payer_id_idx" ON "learned_rule_suggestions"("payer_id");
CREATE INDEX "learned_rule_suggestions_status_idx" ON "learned_rule_suggestions"("status");

CREATE TABLE "playbook_performance" (
    "id" TEXT NOT NULL,
    "playbook_id" TEXT NOT NULL,
    "playbook_version" INTEGER NOT NULL,
    "payer_id" TEXT NOT NULL,
    "plan_name" TEXT,
    "device_category" TEXT,
    "hcpcs_code" TEXT,
    "diagnosis_code" TEXT,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "sample_size" INTEGER NOT NULL,
    "approvals" INTEGER NOT NULL,
    "denials" INTEGER NOT NULL,
    "pended" INTEGER NOT NULL,
    "denial_reasons" JSONB NOT NULL,
    "median_turnaround_days" DOUBLE PRECISION,
    "rework_count" INTEGER NOT NULL DEFAULT 0,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playbook_performance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "playbook_performance_playbook_id_playbook_version_idx" ON "playbook_performance"("playbook_id", "playbook_version");
CREATE INDEX "playbook_performance_payer_id_idx" ON "playbook_performance"("payer_id");

ALTER TABLE "playbook_performance" ADD CONSTRAINT "playbook_performance_playbook_id_fkey" FOREIGN KEY ("playbook_id") REFERENCES "payer_playbooks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "governance_recommendations" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "confidence" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "governance_recommendations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "governance_recommendations_status_idx" ON "governance_recommendations"("status");
CREATE INDEX "governance_recommendations_type_idx" ON "governance_recommendations"("type");

CREATE TABLE "governance_decisions" (
    "id" TEXT NOT NULL,
    "governance_recommendation_id" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "governance_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "governance_decisions_governance_recommendation_id_idx" ON "governance_decisions"("governance_recommendation_id");

ALTER TABLE "governance_decisions" ADD CONSTRAINT "governance_decisions_governance_recommendation_id_fkey" FOREIGN KEY ("governance_recommendation_id") REFERENCES "governance_recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
