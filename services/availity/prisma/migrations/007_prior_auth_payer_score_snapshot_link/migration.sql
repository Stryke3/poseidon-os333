-- Link prior auth packets and requests to the payer score snapshot used at submission time.

ALTER TABLE "availity_prior_auth_packets" ADD COLUMN "payer_score_snapshot_id" TEXT;

ALTER TABLE "availity_prior_auth_requests" ADD COLUMN "payer_score_snapshot_id" TEXT;

CREATE INDEX "availity_prior_auth_packets_payer_score_snapshot_id_idx" ON "availity_prior_auth_packets"("payer_score_snapshot_id");

CREATE INDEX "availity_prior_auth_requests_payer_score_snapshot_id_idx" ON "availity_prior_auth_requests"("payer_score_snapshot_id");

ALTER TABLE "availity_prior_auth_packets" ADD CONSTRAINT "availity_prior_auth_packets_payer_score_snapshot_id_fkey" FOREIGN KEY ("payer_score_snapshot_id") REFERENCES "payer_score_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "availity_prior_auth_requests" ADD CONSTRAINT "availity_prior_auth_requests_payer_score_snapshot_id_fkey" FOREIGN KEY ("payer_score_snapshot_id") REFERENCES "payer_score_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
