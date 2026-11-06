-- Additive. Requires separate Production authorization and an exclusive admin credential.
CREATE UNIQUE INDEX "admin_economic_player_identity" ON "Player" ("id","externalId");
CREATE TABLE "AdminEconomicRevision" (
  "id" TEXT PRIMARY KEY,
  "playerId" TEXT NOT NULL REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "eaId" TEXT NOT NULL,
  "section" TEXT NOT NULL CHECK ("section" IN ('SALARY','CONTRACT','CLAUSE')),
  "revision" INTEGER NOT NULL CHECK ("revision" > 0),
  "requestId" TEXT NOT NULL UNIQUE,
  "action" TEXT NOT NULL CHECK ("action" IN ('EDIT','ROLLBACK')),
  "payload" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL CHECK ("contentHash" ~ '^[a-f0-9]{64}$'),
  "priorId" TEXT REFERENCES "AdminEconomicRevision"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "actor" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  UNIQUE ("playerId","section","revision")
);
ALTER TABLE "AdminEconomicRevision" ADD CONSTRAINT "admin_economic_player_identity_fk"
  FOREIGN KEY ("playerId","eaId") REFERENCES "Player"("id","externalId") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE TABLE "AdminEconomicHead" (
  "playerId" TEXT NOT NULL REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "section" TEXT NOT NULL CHECK ("section" IN ('SALARY','CONTRACT','CLAUSE')),
  "revisionId" TEXT NOT NULL REFERENCES "AdminEconomicRevision"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "revision" INTEGER NOT NULL CHECK ("revision" > 0),
  PRIMARY KEY ("playerId","section")
);
CREATE INDEX "admin_economic_revision_history" ON "AdminEconomicRevision" ("playerId","section","revision" DESC);
CREATE FUNCTION admin_economic_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'ADMIN_ECONOMIC_HISTORY_IMMUTABLE'; END $$;
CREATE TRIGGER admin_economic_revision_immutable BEFORE UPDATE OR DELETE ON "AdminEconomicRevision"
  FOR EACH ROW EXECUTE FUNCTION admin_economic_history_immutable();
CREATE TRIGGER admin_economic_revision_no_truncate BEFORE TRUNCATE ON "AdminEconomicRevision"
  EXECUTE FUNCTION admin_economic_history_immutable();
CREATE TRIGGER admin_economic_head_no_truncate BEFORE TRUNCATE ON "AdminEconomicHead"
  EXECUTE FUNCTION admin_economic_history_immutable();
CREATE FUNCTION admin_economic_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Player" WHERE "id"=NEW."playerId" AND "externalId"=NEW."eaId")
    THEN RAISE EXCEPTION 'ADMIN_EA_IDENTITY_MISMATCH'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER admin_economic_revision_identity BEFORE INSERT ON "AdminEconomicRevision"
  FOR EACH ROW EXECUTE FUNCTION admin_economic_identity();
CREATE FUNCTION admin_economic_head_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP='INSERT' AND NEW."revision"<>1) OR
     (TG_OP='UPDATE' AND (NEW."playerId"<>OLD."playerId" OR NEW."section"<>OLD."section" OR NEW."revision"<>OLD."revision"+1))
    THEN RAISE EXCEPTION 'ADMIN_ECONOMIC_REVISION_SEQUENCE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "AdminEconomicRevision" WHERE "id"=NEW."revisionId"
    AND "playerId"=NEW."playerId" AND "section"=NEW."section" AND "revision"=NEW."revision")
    THEN RAISE EXCEPTION 'ADMIN_ECONOMIC_HEAD_MISMATCH'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER admin_economic_head_guard BEFORE INSERT OR UPDATE ON "AdminEconomicHead"
  FOR EACH ROW EXECUTE FUNCTION admin_economic_head_integrity();
CREATE TRIGGER admin_economic_head_no_delete BEFORE DELETE ON "AdminEconomicHead"
  FOR EACH ROW EXECUTE FUNCTION admin_economic_history_immutable();
CREATE VIEW "AdminEconomicPublic" WITH (security_barrier=true) AS
  SELECT h."playerId",h."section",h."revision",r."payload"
  FROM "AdminEconomicHead" h JOIN "AdminEconomicRevision" r ON r.id=h."revisionId"
  JOIN "Player" p ON p.id=h."playerId" AND p."externalId"=r."eaId"
  WHERE r."playerId"=h."playerId" AND r."section"=h."section" AND r."revision"=h."revision";
CREATE TABLE "AdminLoginAttempt" (
  "key" TEXT PRIMARY KEY, "failures" INTEGER NOT NULL DEFAULT 0,
  "blockedUntil" TIMESTAMPTZ, "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE "AdminSession" (
  "tokenHash" TEXT PRIMARY KEY, "csrfHash" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL, "expiresAt" TIMESTAMPTZ NOT NULL,
  "revokedAt" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE "AdminTotpStep" (
  "step" BIGINT PRIMARY KEY, "usedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
