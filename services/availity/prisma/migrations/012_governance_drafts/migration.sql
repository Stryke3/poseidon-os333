CREATE TABLE "governance_drafts" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payer_id" TEXT NOT NULL,
    "governance_recommendation_id" TEXT,
    "title" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "governance_drafts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "governance_drafts_payer_id_idx" ON "governance_drafts"("payer_id");
CREATE INDEX "governance_drafts_kind_idx" ON "governance_drafts"("kind");
CREATE INDEX "governance_drafts_status_idx" ON "governance_drafts"("status");
CREATE INDEX "governance_drafts_governance_recommendation_id_idx" ON "governance_drafts"("governance_recommendation_id");

ALTER TABLE "governance_drafts" ADD CONSTRAINT "governance_drafts_governance_recommendation_id_fkey" FOREIGN KEY ("governance_recommendation_id") REFERENCES "governance_recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
