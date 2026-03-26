ALTER TABLE "manual_requirements" ADD COLUMN "review_state" TEXT NOT NULL DEFAULT 'AUTO_PENDING';
ALTER TABLE "manual_requirements" ADD COLUMN "extraction_source" TEXT;

UPDATE "manual_requirements"
SET "review_state" = CASE WHEN "active" THEN 'AUTO_ACCEPT' ELSE 'PENDING_REVIEW' END;

CREATE INDEX "manual_requirements_manual_id_review_state_idx" ON "manual_requirements"("manual_id", "review_state");
