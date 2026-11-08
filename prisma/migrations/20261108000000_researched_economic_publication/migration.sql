-- Additive source-research history. Owner revisions and existing economic data are untouched.
CREATE TABLE "ResearchEconomicRevision" (
  id TEXT PRIMARY KEY,
  "playerId" TEXT NOT NULL,
  "eaId" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  field TEXT NOT NULL CHECK (field IN ('SALARY','CONTRACT','CLAUSE')),
  revision INTEGER NOT NULL CHECK (revision > 0),
  "requestId" TEXT NOT NULL UNIQUE,
  "requestHash" TEXT NOT NULL CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
  action TEXT NOT NULL CHECK (action IN ('RECORD','PUBLISH','ROLLBACK')),
  payload JSONB,
  classification TEXT NOT NULL CHECK (classification IN ('OFFICIAL','REPORTED','ESTIMATED','UNKNOWN')),
  "sourceUrl" TEXT NOT NULL CHECK ("sourceUrl" ~ '^https://[^[:space:]]+$'),
  "sourcePublishedOn" TEXT,
  "capturedOn" TEXT NOT NULL CHECK ("capturedOn" ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'),
  "priorId" TEXT REFERENCES "ResearchEconomicRevision"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  "contentHash" TEXT NOT NULL CHECK ("contentHash" ~ '^[a-f0-9]{64}$'),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  UNIQUE ("playerId",field,revision),
  FOREIGN KEY ("playerId","eaId") REFERENCES "Player"(id,"externalId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("clubId") REFERENCES "Club"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (payload IS NULL OR jsonb_typeof(payload)='object')
);
CREATE INDEX "research_economic_revision_history" ON "ResearchEconomicRevision" ("playerId",field,revision DESC);
CREATE TABLE "ResearchEconomicHead" (
  "playerId" TEXT NOT NULL REFERENCES "Player"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  field TEXT NOT NULL CHECK (field IN ('SALARY','CONTRACT','CLAUSE')),
  "revisionId" TEXT NOT NULL REFERENCES "ResearchEconomicRevision"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  PRIMARY KEY ("playerId",field)
);
CREATE FUNCTION research_economic_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'RESEARCH_ECONOMIC_HISTORY_IMMUTABLE'; END $$;
CREATE TRIGGER research_economic_revision_immutable BEFORE UPDATE OR DELETE ON "ResearchEconomicRevision"
  FOR EACH ROW EXECUTE FUNCTION research_economic_history_immutable();
CREATE TRIGGER research_economic_revision_no_truncate BEFORE TRUNCATE ON "ResearchEconomicRevision"
  EXECUTE FUNCTION research_economic_history_immutable();
CREATE FUNCTION research_economic_head_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "ResearchEconomicRevision"%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' AND (NEW."playerId"<>OLD."playerId" OR NEW.field<>OLD.field OR NEW.revision<=OLD.revision) THEN
    RAISE EXCEPTION 'RESEARCH_ECONOMIC_HEAD_SEQUENCE';
  END IF;
  SELECT * INTO r FROM "ResearchEconomicRevision" WHERE id=NEW."revisionId";
  IF r.id IS NULL OR r."playerId"<>NEW."playerId" OR r.field<>NEW.field OR r.revision<>NEW.revision OR
     r.action NOT IN ('PUBLISH','ROLLBACK') THEN
    RAISE EXCEPTION 'RESEARCH_ECONOMIC_HEAD_MISMATCH';
  END IF;
  IF r.payload IS NOT NULL AND r.field='SALARY' AND
     (r.payload->>'taxType' IS DISTINCT FROM 'GROSS' OR r.payload->>'composition' IS DISTINCT FROM 'TOTAL' OR
      COALESCE(r.payload->>'weeklyEur','') !~ '^[0-9]+([.][0-9]{1,2})?$') THEN
    RAISE EXCEPTION 'RESEARCH_SALARY_NOT_GROSS_TOTAL';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER research_economic_head_guard BEFORE INSERT OR UPDATE ON "ResearchEconomicHead"
  FOR EACH ROW EXECUTE FUNCTION research_economic_head_guard();
CREATE TRIGGER research_economic_head_no_delete BEFORE DELETE ON "ResearchEconomicHead"
  FOR EACH ROW EXECUTE FUNCTION research_economic_history_immutable();
CREATE TRIGGER research_economic_head_no_truncate BEFORE TRUNCATE ON "ResearchEconomicHead"
  EXECUTE FUNCTION research_economic_history_immutable();
CREATE VIEW "ResearchEconomicPublic" WITH (security_barrier=true) AS
  SELECT h."playerId",h.field,h.revision,r.payload,r.classification,r."sourceUrl",r."sourcePublishedOn"
  FROM "ResearchEconomicHead" h JOIN "ResearchEconomicRevision" r ON r.id=h."revisionId"
  JOIN "Player" p ON p.id=h."playerId" AND p."externalId"=r."eaId" AND p."clubId"=r."clubId"
  WHERE r.payload IS NOT NULL AND r."playerId"=h."playerId" AND r.field=h.field AND r.revision=h.revision
    AND NOT EXISTS (SELECT 1 FROM "AdminEconomicHead" a WHERE a."playerId"=h."playerId" AND a.section=h.field);
