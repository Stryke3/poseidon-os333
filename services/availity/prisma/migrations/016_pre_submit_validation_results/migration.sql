-- Pre-submit deterministic packet validation results
CREATE TABLE "pre_submit_validation_results" (
  "id" TEXT NOT NULL,
  "packet_id" TEXT NOT NULL,
  "case_id" TEXT NOT NULL,
  "payer_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "missing_requirements" JSONB NOT NULL,
  "violations" JSONB NOT NULL,
  "warnings" JSONB NOT NULL,
  "recommended_actions" JSONB NOT NULL,
  "explanation" JSONB NOT NULL,
  "actor" TEXT,
  "payer_score_snapshot_id" TEXT,
  "playbook_execution_id" TEXT,
  "debug" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "pre_submit_validation_results_packet_id_idx" ON "pre_submit_validation_results"("packet_id");
CREATE INDEX "pre_submit_validation_results_case_id_idx" ON "pre_submit_validation_results"("case_id");
