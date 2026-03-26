-- Replace normalized packet tables with PriorAuthDocument + slim PriorAuthPacket (user model).

DROP TABLE IF EXISTS "availity_generated_packet_documents" CASCADE;
DROP TABLE IF EXISTS "availity_packet_input_snapshots" CASCADE;
DROP TABLE IF EXISTS "availity_packet_audit_logs" CASCADE;
DROP TABLE IF EXISTS "availity_prior_auth_packets" CASCADE;

CREATE TABLE "availity_prior_auth_packets" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "documents" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "availity_prior_auth_packets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "availity_prior_auth_documents" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "input_snapshot" JSONB NOT NULL,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availity_prior_auth_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "availity_prior_auth_packets_case_id_idx" ON "availity_prior_auth_packets"("case_id");
CREATE INDEX "availity_prior_auth_packets_status_idx" ON "availity_prior_auth_packets"("status");

CREATE INDEX "availity_prior_auth_documents_case_id_idx" ON "availity_prior_auth_documents"("case_id");
CREATE INDEX "availity_prior_auth_documents_case_id_type_idx" ON "availity_prior_auth_documents"("case_id", "type");

ALTER TABLE "availity_prior_auth_packets" ADD CONSTRAINT "availity_prior_auth_packets_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "availity_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "availity_prior_auth_documents" ADD CONSTRAINT "availity_prior_auth_documents_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "availity_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
