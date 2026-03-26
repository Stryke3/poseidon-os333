-- CreateTable
CREATE TABLE "availity_cases" (
    "id" UUID NOT NULL,
    "patient_first_name" TEXT NOT NULL,
    "patient_last_name" TEXT NOT NULL,
    "dob" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "payer_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "availity_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availity_eligibility_checks" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "request_payload" JSONB NOT NULL,
    "response_payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availity_eligibility_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availity_prior_auth_requests" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "request_payload" JSONB NOT NULL,
    "response_payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "availity_auth_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "availity_prior_auth_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availity_audit_logs" (
    "id" UUID NOT NULL,
    "case_id" UUID,
    "action" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "request_payload" JSONB,
    "response_payload" JSONB,
    "http_status" INTEGER NOT NULL,
    "actor" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availity_audit_logs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "availity_eligibility_checks" ADD CONSTRAINT "availity_eligibility_checks_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "availity_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availity_prior_auth_requests" ADD CONSTRAINT "availity_prior_auth_requests_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "availity_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availity_audit_logs" ADD CONSTRAINT "availity_audit_logs_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "availity_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
