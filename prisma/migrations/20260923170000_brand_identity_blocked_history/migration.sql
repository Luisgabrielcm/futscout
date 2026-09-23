-- PREPARED ONLY. Apply only after separate approval and preflight; no row mutation.
-- PostgreSQL transactional DDL: failure restores all original indexes. No automatic retry.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE "BrandAssetIdentity" IN SHARE ROW EXCLUSIVE MODE;

-- Keep REVIEW_REQUIRED in the reserved local slot; only BLOCKED identities are historical.
CREATE UNIQUE INDEX "BrandAssetIdentity_one_nonblocked_local_provider_key"
  ON "BrandAssetIdentity"("entityType", "entityId", "provider")
  WHERE "status" <> 'BLOCKED';

CREATE INDEX "BrandAssetIdentity_entityType_entityId_provider_idx"
  ON "BrandAssetIdentity"("entityType", "entityId", "provider");

-- Create the replacement BEFORE removing the old constraint; never drop provider uniqueness.
DROP INDEX "BrandAssetIdentity_entityType_entityId_provider_key";
COMMIT;
