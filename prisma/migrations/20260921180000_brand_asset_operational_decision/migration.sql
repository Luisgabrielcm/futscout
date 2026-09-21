-- PREPARED ONLY: additive operational authorization for Brand Assets.
-- This records a product-owner decision separately from rights evidence.
-- It does not insert, activate or publish any asset.

CREATE TYPE "BrandAssetOperationalDecision" AS ENUM (
  'NOT_AUTHORIZED',
  'OWNER_AUTHORIZED_REMOTE_USE',
  'REVOKED'
);

ALTER TABLE "BrandAsset"
  ADD COLUMN "operationalDecision" "BrandAssetOperationalDecision" NOT NULL DEFAULT 'NOT_AUTHORIZED',
  ADD COLUMN "operationalAuthorizedAt" TIMESTAMP(3),
  ADD COLUMN "operationalDecisionRef" TEXT;

ALTER TABLE "BrandAsset"
  ADD CONSTRAINT "BrandAsset_operational_decision_evidence"
  CHECK (
    ("operationalDecision" = 'NOT_AUTHORIZED'
      AND "operationalAuthorizedAt" IS NULL
      AND "operationalDecisionRef" IS NULL)
    OR
    ("operationalDecision" IN ('OWNER_AUTHORIZED_REMOTE_USE', 'REVOKED')
      AND "operationalAuthorizedAt" IS NOT NULL
      AND length(btrim("operationalDecisionRef")) > 0)
  );

CREATE INDEX "BrandAsset_operationalDecision_status_idx"
  ON "BrandAsset"("operationalDecision", "status");
