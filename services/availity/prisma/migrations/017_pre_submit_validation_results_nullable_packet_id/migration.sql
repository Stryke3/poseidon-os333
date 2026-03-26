-- `ValidationResult` Prisma model intentionally omits `packetId`.
-- Relax DB constraint so inserts work without providing `packet_id`.
ALTER TABLE "pre_submit_validation_results" ALTER COLUMN "packet_id" DROP NOT NULL;

