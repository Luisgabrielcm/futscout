-- PREPARED ONLY: separate authorization/preflight required before applying anywhere.
-- Additive structure only. No model registration, estimates, backfill or Player mutation.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TYPE "FutscoutPotentialEstimateStatus" AS ENUM ('EXPERIMENTAL', 'INVALID');

CREATE TABLE "FutscoutPotentialModel" (
  "version" TEXT NOT NULL,
  "artifactHash" TEXT NOT NULL,
  "inputContractVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FutscoutPotentialModel_pkey" PRIMARY KEY ("version"),
  CONSTRAINT "futscout_potential_model_metadata_check" CHECK (
    length(btrim("version")) > 0 AND "artifactHash" ~ '^[0-9a-f]{64}$'
    AND length(btrim("inputContractVersion")) > 0
  )
);

CREATE TABLE "PlayerFutscoutPotentialEstimate" (
  "id" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "modelVersion" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "inputSnapshot" JSONB NOT NULL,
  "inputAge" DOUBLE PRECISION,
  "inputOverall" DOUBLE PRECISION,
  "inputPosition" TEXT,
  "inputDateOfBirth" TIMESTAMP(3),
  "referenceAt" TIMESTAMP(3) NOT NULL,
  "provenance" JSONB NOT NULL,
  "status" "FutscoutPotentialEstimateStatus" NOT NULL,
  "invalidReason" TEXT,
  "potentialRaw" DOUBLE PRECISION,
  "potentialRounded" INTEGER,
  "peakSeason" INTEGER,
  "computedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerFutscoutPotentialEstimate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "futscout_potential_snapshot_check" CHECK ((
    "inputHash" ~ '^[0-9a-f]{64}$'
    AND jsonb_typeof("inputSnapshot") = 'object'
    AND jsonb_typeof("provenance") = 'object'
    AND "provenance"->>'kind' = 'FUTSCOUT_ESTIMATE'
  ) IS TRUE),
  CONSTRAINT "futscout_potential_result_check" CHECK ((
    ("status" = 'EXPERIMENTAL'
      AND "invalidReason" IS NULL
      AND "inputAge" IS NOT NULL AND "inputAge" BETWEEN 0 AND 100
      AND "inputOverall" IS NOT NULL AND "inputOverall" BETWEEN 1 AND 99
      AND "inputPosition" IS NOT NULL
      AND "inputPosition" IN ('GOL','ZAG','LD','LE','ALA','VOL','MC','MEI','MD','ME','PD','PE','SA','ATA')
      AND "potentialRaw" IS NOT NULL AND "potentialRaw" BETWEEN 1 AND 99
      AND "potentialRounded" IS NOT NULL AND "potentialRounded" BETWEEN 1 AND 99
      AND "peakSeason" IS NOT NULL AND "peakSeason" BETWEEN 1 AND 10
      AND "potentialRounded" = floor("potentialRaw" + 0.5)
    ) OR
    ("status" = 'INVALID'
      AND "potentialRaw" IS NULL AND "potentialRounded" IS NULL AND "peakSeason" IS NULL
      AND "invalidReason" IS NOT NULL AND length(btrim("invalidReason")) > 0
    )
  ) IS TRUE),
  -- IS TRUE rejects SQL UNKNOWN (e.g. missing JSON keys), not just FALSE.
  CONSTRAINT "futscout_potential_projection_check" CHECK ((
    "status" = 'INVALID' OR (
      CASE WHEN jsonb_typeof("inputSnapshot"->'age') = 'number'
        THEN ("inputSnapshot"->>'age')::DOUBLE PRECISION = "inputAge" ELSE FALSE END
      AND CASE WHEN jsonb_typeof("inputSnapshot"->'overall') = 'number'
        THEN ("inputSnapshot"->>'overall')::DOUBLE PRECISION = "inputOverall" ELSE FALSE END
      AND jsonb_typeof("inputSnapshot"->'position') = 'string'
      AND "inputSnapshot"->>'position' = "inputPosition"
    )
  ) IS TRUE)
);

CREATE UNIQUE INDEX "futscout_potential_input_key"
  ON "PlayerFutscoutPotentialEstimate"("playerId", "modelVersion", "inputHash");
CREATE UNIQUE INDEX "futscout_potential_identity_key"
  ON "PlayerFutscoutPotentialEstimate"("id", "playerId");
CREATE INDEX "futscout_potential_player_history_idx"
  ON "PlayerFutscoutPotentialEstimate"("playerId", "computedAt" DESC);
CREATE INDEX "futscout_potential_filter_idx"
  ON "PlayerFutscoutPotentialEstimate"("modelVersion", "status", "potentialRounded", "playerId");

ALTER TABLE "PlayerFutscoutPotentialEstimate" ADD CONSTRAINT "futscout_potential_player_fkey"
  FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "PlayerFutscoutPotentialEstimate" ADD CONSTRAINT "futscout_potential_model_fkey"
  FOREIGN KEY ("modelVersion") REFERENCES "FutscoutPotentialModel"("version") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "PlayerFutscoutPotentialCurrent" (
  "playerId" TEXT NOT NULL,
  "estimateId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "selectedAt" TIMESTAMP(3) NOT NULL,
  "decisionRef" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerFutscoutPotentialCurrent_pkey" PRIMARY KEY ("playerId"),
  CONSTRAINT "futscout_potential_current_metadata_check" CHECK (
    "version" >= 1 AND length(btrim("decisionRef")) > 0
  )
);
CREATE UNIQUE INDEX "PlayerFutscoutPotentialCurrent_estimateId_key"
  ON "PlayerFutscoutPotentialCurrent"("estimateId");
CREATE UNIQUE INDEX "futscout_potential_current_identity_key"
  ON "PlayerFutscoutPotentialCurrent"("estimateId", "playerId");
ALTER TABLE "PlayerFutscoutPotentialCurrent" ADD CONSTRAINT "futscout_potential_current_player_fkey"
  FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "PlayerFutscoutPotentialCurrent" ADD CONSTRAINT "futscout_potential_current_estimate_fkey"
  FOREIGN KEY ("estimateId", "playerId") REFERENCES "PlayerFutscoutPotentialEstimate"("id", "playerId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Deliberately immutable even for upserts; idempotency must read/compare, never overwrite.
CREATE FUNCTION futscout_potential_reject_history_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'FUTSCOUT_POTENTIAL_IMMUTABLE' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER futscout_potential_model_immutable
  BEFORE UPDATE OR DELETE ON "FutscoutPotentialModel"
  FOR EACH ROW EXECUTE FUNCTION futscout_potential_reject_history_mutation();
CREATE TRIGGER futscout_potential_model_no_truncate
  BEFORE TRUNCATE ON "FutscoutPotentialModel"
  FOR EACH STATEMENT EXECUTE FUNCTION futscout_potential_reject_history_mutation();
CREATE TRIGGER futscout_potential_estimate_immutable
  BEFORE UPDATE OR DELETE ON "PlayerFutscoutPotentialEstimate"
  FOR EACH ROW EXECUTE FUNCTION futscout_potential_reject_history_mutation();
CREATE TRIGGER futscout_potential_estimate_no_truncate
  BEFORE TRUNCATE ON "PlayerFutscoutPotentialEstimate"
  FOR EACH STATEMENT EXECUTE FUNCTION futscout_potential_reject_history_mutation();

-- A withdrawn slot remains for CAS; no deletion/recreation that could reset its revision.
CREATE TRIGGER futscout_potential_current_no_delete
  BEFORE DELETE ON "PlayerFutscoutPotentialCurrent"
  FOR EACH ROW EXECUTE FUNCTION futscout_potential_reject_history_mutation();
CREATE TRIGGER futscout_potential_current_no_truncate
  BEFORE TRUNCATE ON "PlayerFutscoutPotentialCurrent"
  FOR EACH STATEMENT EXECUTE FUNCTION futscout_potential_reject_history_mutation();
CREATE FUNCTION futscout_potential_validate_selection() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."version" <> 1 THEN
      RAISE EXCEPTION 'FUTSCOUT_POTENTIAL_INITIAL_REVISION' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW."playerId" IS DISTINCT FROM OLD."playerId"
      OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
      OR NEW."version" <> OLD."version" + 1
      OR NEW."estimateId" IS NOT DISTINCT FROM OLD."estimateId" THEN
      RAISE EXCEPTION 'FUTSCOUT_POTENTIAL_SELECTION_CONFLICT' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW."estimateId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "PlayerFutscoutPotentialEstimate"
    WHERE "id" = NEW."estimateId" AND "playerId" = NEW."playerId" AND "status" = 'EXPERIMENTAL'
  ) THEN
    RAISE EXCEPTION 'FUTSCOUT_POTENTIAL_SELECTION_INVALID' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER futscout_potential_current_validate
  BEFORE INSERT OR UPDATE ON "PlayerFutscoutPotentialCurrent"
  FOR EACH ROW EXECUTE FUNCTION futscout_potential_validate_selection();
COMMIT;
