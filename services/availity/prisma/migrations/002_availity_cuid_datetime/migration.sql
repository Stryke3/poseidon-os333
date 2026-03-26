-- Resets Availity tables to cuid() string PKs, DateTime dob, required JSON payloads,
-- optional audit http_status/actor, drops availity_auth_id. Destructive: existing rows removed.

DROP TABLE IF EXISTS "availity_audit_logs" CASCADE;
DROP TABLE IF EXISTS "availity_eligibility_checks" CASCADE;
DROP TABLE IF EXISTS "availity_prior_auth_requests" CASCADE;
DROP TABLE IF EXISTS "availity_cases" CASCADE;

CREATE TABLE "availity_cases" (
    "id" TEXT NOT NULL,
    "patient_first_name" TEXT NOT NULL,
    "patient_last_name" TEXT NOT NULL,
    "dob" TIMESTAMP(3) NOT NULL,
    "member_id" TEXT NOT NULL,
    "payer_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "availity_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "availity_eligibility_checks" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "request_payload" JSONB NOT NULL,
    "response_payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availity_eligibility_checks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "availity_eligibility_checks_case_id_idx" ON "availity_eligibility_checks"("case_id");

CREATE TABLE "availity_prior_auth_requests" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "request_payload" JSONB NOT NULL,
    "response_payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "availity_prior_auth_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "availity_prior_auth_requests_case_id_idx" ON "availity_prior_auth_requests"("case_id");

CREATE TABLE "availity_audit_logs" (
    "id" TEXT NOT NULL,
    "case_id" TEXT,
    "action" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "request_payload" JSONB,
    "response_payload" JSONB,
    "http_status" INTEGER,
    "actor" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availity_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "availity_audit_logs_case_id_idx" ON "availity_audit_logs"("case_id");
CREATE INDEX "availity_audit_logs_action_idx" ON "availity_audit_logs"("action");
CREATE INDEX "availity_audit_logs_created_at_idx" ON "availity_audit_logs"("created_at");

ALTER TABLE "availity_eligibility_checks" ADD CONSTRAINT "availity_eligibility_checks_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "availity_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "availity_prior_auth_requests" ADD CONSTRAINT "availity_prior_auth_requests_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "availity_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "availity_audit_logs" ADD CONSTRAINT "availity_audit_logs_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "availity_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
