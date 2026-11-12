-- Additive candidate. Apply only after explicit approval for the destination.
-- Wage LOW-confidence estimates are separate from HIGH observed economic facts.
CREATE TABLE "WagePublicationRelease" (
  "id" TEXT PRIMARY KEY CHECK ("id" ~ '^[a-f0-9]{64}$'),
  "manifest" JSONB NOT NULL,
  "recordCount" INTEGER NOT NULL CHECK ("recordCount" > 0),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "PlayerWagePublication" (
  "releaseId" TEXT NOT NULL REFERENCES "WagePublicationRelease"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "playerId" TEXT NOT NULL REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "eaId" TEXT NOT NULL CHECK ("eaId" ~ '^[0-9]+$'),
  "annualEur" DECIMAL(38,18) NOT NULL CHECK ("annualEur" > 0 AND "annualEur" <= 9007199254740991),
  "currency" TEXT NOT NULL CHECK ("currency" = 'EUR'),
  "kind" TEXT NOT NULL CHECK ("kind" IN ('ESTIMATE','HISTORICAL_REFERENCE')),
  "method" TEXT NOT NULL CHECK ("method" IN ('RECENT_HISTORICAL_REFERENCE','WAGE_V2','BROAD_FALLBACK','COMPARABLES')),
  "period" TEXT,
  "modelVersion" TEXT NOT NULL,
  "asOf" TEXT NOT NULL,
  "confidence" TEXT NOT NULL CHECK ("confidence" = 'LOW'),
  "contractVerified" BOOLEAN NOT NULL CHECK ("contractVerified" = FALSE),
  "recordSha256" TEXT NOT NULL CHECK ("recordSha256" ~ '^[a-f0-9]{64}$'),
  "metadata" JSONB NOT NULL,
  PRIMARY KEY ("releaseId", "eaId"),
  UNIQUE ("releaseId", "playerId"),
  CHECK (("kind" = 'HISTORICAL_REFERENCE') = ("method" = 'RECENT_HISTORICAL_REFERENCE'))
);
CREATE INDEX "wage_publication_player" ON "PlayerWagePublication" ("playerId", "releaseId");
CREATE TABLE "WagePublicationEvent" (
  "requestId" TEXT PRIMARY KEY,
  "requestSha256" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('STAGE','ACTIVATE','ROLLBACK')),
  "receipt" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "WagePublicationHead" (
  "id" TEXT PRIMARY KEY CHECK ("id" = 'WAGE'),
  "releaseId" TEXT REFERENCES "WagePublicationRelease"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "revision" INTEGER NOT NULL CHECK ("revision" >= 0),
  "requestId" TEXT REFERENCES "WagePublicationEvent"("requestId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
INSERT INTO "WagePublicationHead" ("id","revision") VALUES ('WAGE',0);
CREATE FUNCTION wage_publication_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'WAGE_HISTORY_IMMUTABLE'; END $$;
CREATE TRIGGER wage_release_immutable BEFORE UPDATE OR DELETE ON "WagePublicationRelease"
  FOR EACH ROW EXECUTE FUNCTION wage_publication_immutable();
CREATE TRIGGER wage_record_immutable BEFORE UPDATE OR DELETE ON "PlayerWagePublication"
  FOR EACH ROW EXECUTE FUNCTION wage_publication_immutable();
CREATE TRIGGER wage_event_immutable BEFORE UPDATE OR DELETE ON "WagePublicationEvent"
  FOR EACH ROW EXECUTE FUNCTION wage_publication_immutable();
CREATE TRIGGER wage_release_no_truncate BEFORE TRUNCATE ON "WagePublicationRelease"
  EXECUTE FUNCTION wage_publication_immutable();
CREATE TRIGGER wage_record_no_truncate BEFORE TRUNCATE ON "PlayerWagePublication"
  EXECUTE FUNCTION wage_publication_immutable();
CREATE TRIGGER wage_event_no_truncate BEFORE TRUNCATE ON "WagePublicationEvent"
  EXECUTE FUNCTION wage_publication_immutable();
CREATE TRIGGER wage_head_no_truncate BEFORE TRUNCATE ON "WagePublicationHead"
  EXECUTE FUNCTION wage_publication_immutable();
CREATE FUNCTION wage_publication_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "WagePublicationEvent" WHERE "kind"='STAGE' AND "receipt"->>'releaseId'=NEW."releaseId") AND
     NOT EXISTS (SELECT 1 FROM "PlayerWagePublication" WHERE "releaseId"=NEW."releaseId" AND "eaId"=NEW."eaId" AND
       "recordSha256"=NEW."recordSha256" AND "playerId"=NEW."playerId")
    THEN RAISE EXCEPTION 'WAGE_RELEASE_SEALED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "Player" WHERE "id"=NEW."playerId" AND "externalId"=NEW."eaId")
    THEN RAISE EXCEPTION 'WAGE_EA_IDENTITY_MISMATCH'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER wage_record_identity BEFORE INSERT ON "PlayerWagePublication"
  FOR EACH ROW EXECUTE FUNCTION wage_publication_identity();
CREATE FUNCTION wage_publication_head_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e JSONB; n INTEGER; expected INTEGER;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'WAGE_HEAD_TRANSITION_REQUIRED'; END IF;
  IF NEW."revision" <> OLD."revision" + 1 OR NEW."requestId" IS NULL THEN RAISE EXCEPTION 'WAGE_HEAD_CAS_REQUIRED'; END IF;
  SELECT "receipt" INTO e FROM "WagePublicationEvent" WHERE "requestId"=NEW."requestId" AND "kind" IN ('ACTIVATE','ROLLBACK');
  IF e IS NULL OR (e->>'revision')::INTEGER <> NEW."revision" OR
     (e->>'previousRevision')::INTEGER <> OLD."revision" OR
     (e->>'previousReleaseId') IS DISTINCT FROM OLD."releaseId" OR
     (e->>'releaseId') IS DISTINCT FROM NEW."releaseId" OR
     (e->'approval'->>'decision') IS DISTINCT FROM 'APPROVED' OR
     (e->'approval'->>'releaseSha256') IS DISTINCT FROM NEW."releaseId" OR
     (e->'approval'->>'action') IS DISTINCT FROM (e->>'action') OR
     COALESCE(e->'approval'->>'rightsReviewSha256','') !~ '^[a-f0-9]{64}$' OR
     COALESCE(e->'approval'->>'qualityReviewSha256','') !~ '^[a-f0-9]{64}$' OR
     (e->'approval'->>'qualityAccepted') IS DISTINCT FROM 'true' OR
     (e->'approval'->>'rightsAccepted') IS DISTINCT FROM 'true' OR
     (e->'approval'->>'lowConfidenceAccepted') IS DISTINCT FROM 'true'
    THEN RAISE EXCEPTION 'WAGE_APPROVED_RECEIPT_REQUIRED'; END IF;
  IF NEW."releaseId" IS NOT NULL THEN
    SELECT "recordCount" INTO expected FROM "WagePublicationRelease" WHERE "id"=NEW."releaseId";
    SELECT count(*) INTO n FROM "PlayerWagePublication" WHERE "releaseId"=NEW."releaseId";
    IF n IS DISTINCT FROM expected THEN RAISE EXCEPTION 'WAGE_RELEASE_INCOMPLETE'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER wage_head_guard BEFORE UPDATE OR DELETE ON "WagePublicationHead"
  FOR EACH ROW EXECUTE FUNCTION wage_publication_head_guard();
