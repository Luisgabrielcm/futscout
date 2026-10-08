-- Additive only. Never copies legacy Player.marketValue/marketCurrency.
CREATE TABLE "PlayerEconomicState" (
  "id" TEXT PRIMARY KEY, "playerId" TEXT NOT NULL, "field" TEXT NOT NULL,
  "provider" TEXT NOT NULL, "providerPlayerId" TEXT NOT NULL, "context" TEXT NOT NULL,
  "snapshotVersion" TEXT NOT NULL, "presence" TEXT NOT NULL,
  "amount" DECIMAL(20,2), "currency" TEXT, "period" TEXT,
  "contractUntil" DATE, "datePrecision" TEXT, "providerEffectiveAt" TIMESTAMPTZ(3),
  "confidence" TEXT NOT NULL, "matchState" TEXT NOT NULL, "status" TEXT NOT NULL,
  "metadata" JSONB NOT NULL, "contentHash" TEXT NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "economic_state_player_fk" FOREIGN KEY ("playerId") REFERENCES "Player"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "economic_state_identity" UNIQUE (id,"playerId",field),
  CONSTRAINT "economic_state_dedup" UNIQUE ("playerId",provider,"providerPlayerId",context,field,"snapshotVersion","contentHash"),
  CONSTRAINT "economic_state_shape" CHECK (
    field IN ('MARKET_VALUE','WAGE_WEEKLY','CONTRACT_UNTIL','RELEASE_CLAUSE') AND
    context IN ('REAL_WORLD','EA_CAREER') AND presence IN ('VALUE','NULL','ABSENT') AND
    confidence IN ('HIGH','MEDIUM','LOW','NOT_FOUND') AND "matchState" IN ('MATCHED','AMBIGUOUS','NOT_FOUND') AND
    status IN ('VALID','MISSING','REJECTED') AND "contentHash" ~ '^[a-f0-9]{64}$' AND
    length(provider)>0 AND length("providerPlayerId")>0 AND length("snapshotVersion")>0 AND
    jsonb_typeof(metadata)='object' AND (currency IS NULL OR currency ~ '^[A-Z]{3}$') AND
    (CASE WHEN presence <> 'VALUE' THEN
      amount IS NULL AND "contractUntil" IS NULL AND "datePrecision" IS NULL AND period IS NULL AND status <> 'VALID'
    WHEN field='CONTRACT_UNTIL' THEN
      status='VALID' AND amount IS NULL AND currency IS NULL AND period IS NULL AND "contractUntil" IS NOT NULL AND
      "datePrecision" IS NOT NULL AND "datePrecision" IN ('DAY','MONTH','YEAR') AND
      ("datePrecision"='DAY' OR EXTRACT(DAY FROM "contractUntil")=1) AND
      ("datePrecision"<>'YEAR' OR EXTRACT(MONTH FROM "contractUntil")=1)
    ELSE
      status='VALID' AND amount IS NOT NULL AND amount >= 0 AND currency IS NOT NULL AND
      "contractUntil" IS NULL AND "datePrecision" IS NULL AND
      (CASE WHEN field='WAGE_WEEKLY' THEN period IS NOT NULL AND period='WEEK' ELSE period IS NULL END)
    END)
  )
);
CREATE INDEX "PlayerEconomicState_playerId_field_createdAt_idx" ON "PlayerEconomicState"("playerId",field,"createdAt");
CREATE TABLE "PlayerEconomicObservation" (
  id TEXT PRIMARY KEY, "stateId" TEXT NOT NULL, "playerId" TEXT NOT NULL, field TEXT NOT NULL,
  "observedAt" TIMESTAMPTZ(3) NOT NULL, "requestId" TEXT NOT NULL UNIQUE,
  CONSTRAINT "economic_observation_identity" UNIQUE (id,"playerId",field),
  CONSTRAINT "economic_observation_player_fk" FOREIGN KEY ("playerId") REFERENCES "Player"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "economic_observation_state_fk" FOREIGN KEY ("stateId","playerId",field) REFERENCES "PlayerEconomicState"(id,"playerId",field) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "PlayerEconomicObservation_playerId_field_observedAt_idx" ON "PlayerEconomicObservation"("playerId",field,"observedAt");
CREATE TABLE "PlayerEconomicCurrent" (
  "playerId" TEXT NOT NULL, field TEXT NOT NULL, "observationId" TEXT NOT NULL, revision INTEGER NOT NULL,
  "selectedAt" TIMESTAMPTZ(3) NOT NULL, "selectionReason" TEXT NOT NULL, "policyVersion" TEXT NOT NULL,
  PRIMARY KEY ("playerId",field),
  CONSTRAINT "economic_current_player_fk" FOREIGN KEY ("playerId") REFERENCES "Player"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "economic_current_observation_fk" FOREIGN KEY ("observationId","playerId",field) REFERENCES "PlayerEconomicObservation"(id,"playerId",field) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "economic_current_revision" CHECK (revision >= 1 AND length("selectionReason")>0 AND length("policyVersion")>0)
);
CREATE FUNCTION economic_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'ECONOMIC_HISTORY_IMMUTABLE' USING ERRCODE='23514'; END $$;
CREATE TRIGGER economic_state_immutable BEFORE UPDATE OR DELETE ON "PlayerEconomicState" FOR EACH ROW EXECUTE FUNCTION economic_history_immutable();
CREATE TRIGGER economic_observation_immutable BEFORE UPDATE OR DELETE ON "PlayerEconomicObservation" FOR EACH ROW EXECUTE FUNCTION economic_history_immutable();
CREATE TRIGGER economic_state_no_truncate BEFORE TRUNCATE ON "PlayerEconomicState" FOR EACH STATEMENT EXECUTE FUNCTION economic_history_immutable();
CREATE TRIGGER economic_observation_no_truncate BEFORE TRUNCATE ON "PlayerEconomicObservation" FOR EACH STATEMENT EXECUTE FUNCTION economic_history_immutable();
CREATE FUNCTION economic_current_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.revision <> 1 THEN RAISE EXCEPTION 'ECONOMIC_REVISION_INVALID' USING ERRCODE='23514'; END IF;
  ELSE
    IF NEW."playerId"<>OLD."playerId" OR NEW.field<>OLD.field OR NEW.revision<>OLD.revision+1 THEN
      RAISE EXCEPTION 'ECONOMIC_REVISION_INVALID' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "PlayerEconomicObservation" o JOIN "PlayerEconomicState" s ON s.id=o."stateId"
    WHERE o.id=NEW."observationId" AND o."playerId"=NEW."playerId" AND o.field=NEW.field AND
      s.confidence='HIGH' AND s."matchState"='MATCHED' AND s.status<>'REJECTED') THEN
    RAISE EXCEPTION 'ECONOMIC_CURRENT_INELIGIBLE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER economic_current_guard BEFORE INSERT OR UPDATE ON "PlayerEconomicCurrent" FOR EACH ROW EXECUTE FUNCTION economic_current_guard();
