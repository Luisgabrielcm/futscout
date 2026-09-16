-- PREPARED ONLY: Phase C must not apply this migration to the real database.
-- No existing scalar columns, backfills or legacy history are modified.
CREATE TABLE "PlayerTransferObservation" (
  "id" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerPlayerId" INTEGER NOT NULL,
  "providerPlayerNameRaw" TEXT NOT NULL,
  "transferDate" TIMESTAMP(3),
  "dateRaw" TEXT,
  "fromProviderTeamId" INTEGER,
  "fromTeamNameRaw" TEXT,
  "toProviderTeamId" INTEGER,
  "toTeamNameRaw" TEXT,
  "typeRaw" TEXT,
  "payloadVersion" INTEGER NOT NULL,
  "contentHash" TEXT NOT NULL,
  "logicalEventKey" TEXT NOT NULL,
  "possibleRevisionHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "sourceGroup" INTEGER NOT NULL,
  "sourceOrder" INTEGER NOT NULL,
  "sourceIndex" INTEGER NOT NULL,
  "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerTransferObservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlayerTransferObservation_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "transfer_observation_content_key" ON "PlayerTransferObservation"("playerId", "provider", "contentHash");
CREATE INDEX "transfer_observation_player_date_idx" ON "PlayerTransferObservation"("playerId", "transferDate" DESC);
CREATE INDEX "transfer_observation_event_idx" ON "PlayerTransferObservation"("provider", "providerPlayerId", "logicalEventKey");

CREATE TABLE "PlayerCurrentClubState" (
  "playerId" TEXT NOT NULL,
  "clubId" TEXT,
  "providerTeamId" INTEGER,
  "effectiveSince" TIMESTAMP(3),
  "decision" TEXT NOT NULL,
  "evidenceHash" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  "evaluatedAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROPOSED',
  CONSTRAINT "PlayerCurrentClubState_pkey" PRIMARY KEY ("playerId"),
  CONSTRAINT "PlayerCurrentClubState_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "PlayerCurrentClubState_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "current_club_state_club_idx" ON "PlayerCurrentClubState"("clubId", "status");
CREATE INDEX "current_club_state_review_idx" ON "PlayerCurrentClubState"("decision", "evaluatedAt");

-- Append-only source facts. The application role must not have permission to disable these triggers.
CREATE FUNCTION futscout_transfer_observation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'TRANSFER_OBSERVATION_IMMUTABLE';
END;
$$;
CREATE TRIGGER transfer_observation_no_mutation
BEFORE UPDATE OR DELETE ON "PlayerTransferObservation"
FOR EACH ROW EXECUTE FUNCTION futscout_transfer_observation_immutable();
CREATE TRIGGER transfer_observation_no_truncate
BEFORE TRUNCATE ON "PlayerTransferObservation"
FOR EACH STATEMENT EXECUTE FUNCTION futscout_transfer_observation_immutable();
