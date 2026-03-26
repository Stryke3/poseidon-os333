-- Idempotent trident manual scan: tie rows to source file path + content hash.
ALTER TABLE "payer_manuals" ADD COLUMN "content_fingerprint" TEXT;

CREATE INDEX "payer_manuals_source_path_idx" ON "payer_manuals"("source_path");
CREATE INDEX "payer_manuals_content_fingerprint_idx" ON "payer_manuals"("content_fingerprint");
