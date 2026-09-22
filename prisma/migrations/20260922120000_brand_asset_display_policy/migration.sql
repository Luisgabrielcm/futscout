-- PREPARED ONLY: separate documentary rights from operational display policy.
-- This migration is additive and intentionally performs no data migration or publication.
CREATE TYPE "BrandAssetDisplayPolicy" AS ENUM ('DISPLAY_ALLOWED', 'DISPLAY_BLOCKED');

ALTER TABLE "BrandAsset"
  ADD COLUMN "displayPolicy" "BrandAssetDisplayPolicy" NOT NULL DEFAULT 'DISPLAY_BLOCKED';

ALTER TABLE "BrandAsset"
  ADD CONSTRAINT "BrandAsset_display_policy_consistency_check" CHECK (
    ("rightsStatus" <> 'BLOCKED' AND "operationalDecision" <> 'REVOKED')
    OR "displayPolicy" = 'DISPLAY_BLOCKED'
  );

CREATE INDEX "BrandAsset_displayPolicy_status_idx"
  ON "BrandAsset"("displayPolicy", "status");
