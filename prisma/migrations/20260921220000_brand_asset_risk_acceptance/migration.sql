-- PREPARED ONLY: additive structure for explicit operator-risk acceptance.
-- This migration intentionally performs no data migration or asset publication.
ALTER TABLE "BrandAsset"
  ADD COLUMN "operatorRiskAccepted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "riskAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "riskAcceptedBy" TEXT,
  ADD COLUMN "riskReason" TEXT,
  ADD COLUMN "sourceTermsUrl" TEXT,
  ADD COLUMN "revocable" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "BrandAsset"
  ADD CONSTRAINT "BrandAsset_risk_acceptance_consistency_check" CHECK (
    (
      "operationalDecision" = 'NOT_AUTHORIZED'
      AND "operatorRiskAccepted" = false
      AND "riskAcceptedAt" IS NULL
      AND "riskAcceptedBy" IS NULL
      AND "riskReason" IS NULL
      AND "sourceTermsUrl" IS NULL
      AND "revocable" = true
    )
    OR
    (
      "operationalDecision" IN ('OWNER_AUTHORIZED_REMOTE_USE', 'REVOKED')
      AND "operatorRiskAccepted" = true
      AND "riskAcceptedAt" IS NOT NULL
      AND length(btrim("riskAcceptedBy")) > 0
      AND length(btrim("riskReason")) > 0
      AND "sourceTermsUrl" ~ '^https://'
      AND "revocable" = true
    )
  );

CREATE INDEX "BrandAsset_operatorRiskAccepted_status_idx"
  ON "BrandAsset"("operatorRiskAccepted", "status");
