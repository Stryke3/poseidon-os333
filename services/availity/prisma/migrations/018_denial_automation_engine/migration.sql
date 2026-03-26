-- Denial-to-Appeal Automation Engine

CREATE TABLE "denial_events" (
  "id" TEXT NOT NULL,
  "case_id" TEXT,
  "payer_id" TEXT NOT NULL,
  "plan_name" TEXT,
  "auth_id" TEXT,
  "denial_code" TEXT,
  "denial_reason_text" TEXT NOT NULL,
  "denial_category" TEXT,
  "packet_id" TEXT,
  "playbook_id" TEXT,
  "playbook_version" INTEGER,
  "score_snapshot_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "denial_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "denial_events_case_id_idx" ON "denial_events"("case_id");
CREATE INDEX "denial_events_payer_id_idx" ON "denial_events"("payer_id");
CREATE INDEX "denial_events_denial_category_idx" ON "denial_events"("denial_category");

-- Foreign key: case_id -> availity_cases.id
ALTER TABLE "denial_events" ADD CONSTRAINT "denial_events_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "availity_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "denial_classification_snapshots" (
  "id" TEXT NOT NULL,
  "denial_event_id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION,
  "recovery_type" TEXT NOT NULL,
  "required_fixes" JSONB NOT NULL,
  "required_attachments" JSONB NOT NULL,
  "escalation_steps" JSONB NOT NULL,
  "explanation" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "denial_classification_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "denial_classification_snapshots_denial_event_id_idx" ON "denial_classification_snapshots"("denial_event_id");
CREATE INDEX "denial_classification_snapshots_category_idx" ON "denial_classification_snapshots"("category");

ALTER TABLE "denial_classification_snapshots" ADD CONSTRAINT "denial_classification_snapshots_denial_event_id_fkey" FOREIGN KEY ("denial_event_id") REFERENCES "denial_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "appeal_packets" (
  "id" TEXT NOT NULL,
  "denial_event_id" TEXT NOT NULL,
  "case_id" TEXT,
  "recovery_type" TEXT NOT NULL,
  "letter_text" TEXT,
  "rebuttal_points" JSONB NOT NULL,
  "attachment_checklist" JSONB NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "appeal_packets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "appeal_packets_denial_event_id_idx" ON "appeal_packets"("denial_event_id");
CREATE INDEX "appeal_packets_case_id_idx" ON "appeal_packets"("case_id");

ALTER TABLE "appeal_packets" ADD CONSTRAINT "appeal_packets_denial_event_id_fkey" FOREIGN KEY ("denial_event_id") REFERENCES "denial_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appeal_packets" ADD CONSTRAINT "appeal_packets_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "availity_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "appeal_outcomes" (
  "id" TEXT NOT NULL,
  "appeal_packet_id" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "resolved_at" TIMESTAMP(3),
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "appeal_outcomes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "appeal_outcomes_appeal_packet_id_idx" ON "appeal_outcomes"("appeal_packet_id");
CREATE INDEX "appeal_outcomes_outcome_idx" ON "appeal_outcomes"("outcome");

ALTER TABLE "appeal_outcomes" ADD CONSTRAINT "appeal_outcomes_appeal_packet_id_fkey" FOREIGN KEY ("appeal_packet_id") REFERENCES "appeal_packets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
