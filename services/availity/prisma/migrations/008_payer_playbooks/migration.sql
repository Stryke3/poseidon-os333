-- Payer Playbook Engine: versioned strategies + execution audit trail.

CREATE TABLE "payer_playbooks" (
    "id" TEXT NOT NULL,
    "logical_id" TEXT NOT NULL,
    "payer_id" TEXT NOT NULL,
    "plan_name" TEXT,
    "device_category" TEXT,
    "hcpcs_code" TEXT,
    "diagnosis_code" TEXT,
    "strategy_rules" JSONB NOT NULL,
    "document_modifications" JSONB NOT NULL,
    "escalation_instructions" JSONB NOT NULL,
    "submission_timing" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payer_playbooks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payer_playbooks_logical_id_version_key" ON "payer_playbooks"("logical_id", "version");

CREATE INDEX "payer_playbooks_payer_id_active_idx" ON "payer_playbooks"("payer_id", "active");

CREATE TABLE "payer_playbook_executions" (
    "id" TEXT NOT NULL,
    "playbook_id" TEXT NOT NULL,
    "playbook_logical_id" TEXT NOT NULL,
    "playbook_version" INTEGER NOT NULL,
    "case_id" TEXT,
    "packet_id" TEXT,
    "match_context" JSONB NOT NULL,
    "execution_log" JSONB NOT NULL,
    "modified_document_ids" JSONB,
    "payer_score_snapshot_id" TEXT,
    "authorization_outcome_id" TEXT,
    "actor" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payer_playbook_executions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payer_playbook_executions_playbook_id_idx" ON "payer_playbook_executions"("playbook_id");

CREATE INDEX "payer_playbook_executions_case_id_idx" ON "payer_playbook_executions"("case_id");

CREATE INDEX "payer_playbook_executions_packet_id_idx" ON "payer_playbook_executions"("packet_id");

CREATE INDEX "payer_playbook_executions_payer_score_snapshot_id_idx" ON "payer_playbook_executions"("payer_score_snapshot_id");

ALTER TABLE "payer_playbook_executions" ADD CONSTRAINT "payer_playbook_executions_playbook_id_fkey" FOREIGN KEY ("playbook_id") REFERENCES "payer_playbooks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payer_playbook_executions" ADD CONSTRAINT "payer_playbook_executions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "availity_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payer_playbook_executions" ADD CONSTRAINT "payer_playbook_executions_payer_score_snapshot_id_fkey" FOREIGN KEY ("payer_score_snapshot_id") REFERENCES "payer_score_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payer_playbook_executions" ADD CONSTRAINT "payer_playbook_executions_authorization_outcome_id_fkey" FOREIGN KEY ("authorization_outcome_id") REFERENCES "authorization_outcomes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
