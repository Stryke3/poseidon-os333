-- Prior authorization packet generator: structured documents, snapshots, audit.

CREATE TABLE "availity_prior_auth_packets" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "device_type" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "packet_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_actor" TEXT,

    CONSTRAINT "availity_prior_auth_packets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "availity_packet_input_snapshots" (
    "id" TEXT NOT NULL,
    "packet_id" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "snapshot_hash" TEXT NOT NULL,
    "generation_version" INTEGER NOT NULL,
    "actor" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availity_packet_input_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "availity_generated_packet_documents" (
    "id" TEXT NOT NULL,
    "packet_id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL,
    "doc_version" INTEGER NOT NULL,
    "rendered_text" TEXT NOT NULL,
    "provenance_json" JSONB NOT NULL,
    "template_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availity_generated_packet_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "availity_packet_audit_logs" (
    "id" TEXT NOT NULL,
    "packet_id" TEXT NOT NULL,
    "case_id" TEXT,
    "action" TEXT NOT NULL,
    "detail_json" JSONB,
    "actor" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availity_packet_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "availity_prior_auth_packets_case_id_idx" ON "availity_prior_auth_packets"("case_id");
CREATE INDEX "availity_prior_auth_packets_status_idx" ON "availity_prior_auth_packets"("status");

CREATE INDEX "availity_packet_input_snapshots_packet_id_idx" ON "availity_packet_input_snapshots"("packet_id");

CREATE INDEX "availity_generated_packet_documents_packet_id_idx" ON "availity_generated_packet_documents"("packet_id");
CREATE INDEX "availity_generated_packet_documents_snapshot_id_idx" ON "availity_generated_packet_documents"("snapshot_id");
CREATE INDEX "availity_generated_packet_documents_doc_type_idx" ON "availity_generated_packet_documents"("doc_type");

CREATE INDEX "availity_packet_audit_logs_packet_id_idx" ON "availity_packet_audit_logs"("packet_id");
CREATE INDEX "availity_packet_audit_logs_case_id_idx" ON "availity_packet_audit_logs"("case_id");
CREATE INDEX "availity_packet_audit_logs_action_idx" ON "availity_packet_audit_logs"("action");

ALTER TABLE "availity_prior_auth_packets" ADD CONSTRAINT "availity_prior_auth_packets_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "availity_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "availity_packet_input_snapshots" ADD CONSTRAINT "availity_packet_input_snapshots_packet_id_fkey" FOREIGN KEY ("packet_id") REFERENCES "availity_prior_auth_packets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "availity_generated_packet_documents" ADD CONSTRAINT "availity_generated_packet_documents_packet_id_fkey" FOREIGN KEY ("packet_id") REFERENCES "availity_prior_auth_packets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "availity_generated_packet_documents" ADD CONSTRAINT "availity_generated_packet_documents_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "availity_packet_input_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "availity_packet_audit_logs" ADD CONSTRAINT "availity_packet_audit_logs_packet_id_fkey" FOREIGN KEY ("packet_id") REFERENCES "availity_prior_auth_packets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "availity_packet_audit_logs" ADD CONSTRAINT "availity_packet_audit_logs_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "availity_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
