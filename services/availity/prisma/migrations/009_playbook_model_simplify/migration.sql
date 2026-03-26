-- Align playbook storage with simplified PayerPlaybook + PlaybookExecution models.

DROP TABLE IF EXISTS "payer_playbook_executions";
DROP TABLE IF EXISTS "payer_playbooks";

CREATE TABLE "payer_playbooks" (
    "id" TEXT NOT NULL,
    "payer_id" TEXT NOT NULL,
    "plan_name" TEXT,
    "device_category" TEXT,
    "hcpcs_code" TEXT,
    "diagnosis_code" TEXT,
    "strategy" JSONB NOT NULL,
    "document_rules" JSONB NOT NULL,
    "escalation_rules" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payer_playbooks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payer_playbooks_payer_id_idx" ON "payer_playbooks"("payer_id");

CREATE INDEX "payer_playbooks_hcpcs_code_idx" ON "payer_playbooks"("hcpcs_code");

CREATE INDEX "payer_playbooks_diagnosis_code_idx" ON "payer_playbooks"("diagnosis_code");

CREATE TABLE "playbook_executions" (
    "id" TEXT NOT NULL,
    "case_id" TEXT,
    "playbook_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "input_snapshot" JSONB NOT NULL,
    "output_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playbook_executions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "playbook_executions_case_id_idx" ON "playbook_executions"("case_id");

CREATE INDEX "playbook_executions_playbook_id_idx" ON "playbook_executions"("playbook_id");

ALTER TABLE "playbook_executions" ADD CONSTRAINT "playbook_executions_playbook_id_fkey" FOREIGN KEY ("playbook_id") REFERENCES "payer_playbooks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "playbook_executions" ADD CONSTRAINT "playbook_executions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "availity_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
