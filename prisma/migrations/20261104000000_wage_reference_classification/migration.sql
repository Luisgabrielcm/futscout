-- Additive only. No UPDATE/backfill of active salaries or existing release hashes.
-- Evidence storage is not publication authorization. Reversal retains committed history.
CREATE TABLE "WageReferenceObservation" (
  "id" TEXT PRIMARY KEY CHECK ("id" ~ '^[a-f0-9]{64}$'),
  "playerId" TEXT NOT NULL REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "eaId" TEXT NOT NULL CHECK ("eaId" ~ '^[0-9]+$'),
  "annualOriginal" DECIMAL(38,18) NOT NULL CHECK ("annualOriginal" > 0 AND "annualOriginal" <= 9007199254740991),
  "currency" TEXT NOT NULL CHECK ("currency" = 'EUR'),
  "periodicity" TEXT NOT NULL CHECK ("periodicity" = 'YEAR'),
  "taxType" TEXT NOT NULL CHECK ("taxType" IN ('NET','GROSS','UNKNOWN')),
  "composition" TEXT NOT NULL CHECK ("composition" IN ('BASE','GUARANTEED','TOTAL','MIXED_UNCLASSIFIED','UNKNOWN')),
  "method" TEXT NOT NULL CHECK ("method" IN ('OFFICIAL_REFERENCE','HISTORICAL_REFERENCE','MODEL_ESTIMATE','FALLBACK')),
  "season" TEXT NOT NULL CHECK (length(trim("season")) > 0),
  "sourceName" TEXT NOT NULL CHECK (length(trim("sourceName")) BETWEEN 1 AND 160),
  "sourceUrl" TEXT NOT NULL CHECK ("sourceUrl" ~ '^https://[^[:space:]]+$'),
  "publishedAt" TEXT NOT NULL CHECK ("publishedAt" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  "evidenceSha256" TEXT NOT NULL CHECK ("evidenceSha256" ~ '^[a-f0-9]{64}$'),
  "previousId" TEXT REFERENCES "WageReferenceObservation"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "metadata" JSONB NOT NULL,
  "publicationAllowed" BOOLEAN NOT NULL DEFAULT FALSE CHECK ("publicationAllowed" = FALSE),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "WageReferenceObservation_eaId_season_idx" ON "WageReferenceObservation"("eaId","season");
CREATE FUNCTION wage_reference_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Player" WHERE id=NEW."playerId" AND "externalId"=NEW."eaId")
    THEN RAISE EXCEPTION 'WAGE_REFERENCE_IDENTITY_MISMATCH'; END IF;
  IF NEW."previousId" IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM "WageReferenceObservation" WHERE id=NEW."previousId" AND "eaId"=NEW."eaId" AND "playerId"=NEW."playerId")
    THEN RAISE EXCEPTION 'WAGE_REFERENCE_HISTORY_IDENTITY_MISMATCH'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER wage_reference_identity BEFORE INSERT ON "WageReferenceObservation"
  FOR EACH ROW EXECUTE FUNCTION wage_reference_identity();
CREATE TRIGGER wage_reference_immutable BEFORE UPDATE OR DELETE ON "WageReferenceObservation"
  FOR EACH ROW EXECUTE FUNCTION wage_publication_immutable();
CREATE TRIGGER wage_reference_no_truncate BEFORE TRUNCATE ON "WageReferenceObservation"
  EXECUTE FUNCTION wage_publication_immutable();
