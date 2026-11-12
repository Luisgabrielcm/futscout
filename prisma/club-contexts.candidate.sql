-- PREPARED ONLY. Not a deployed migration. Requires separate database authorization.
-- No Player/Club/economic/manual data UPDATE, DELETE or backfill is included.
-- CreateTable
CREATE TABLE "EaRosterReference" (
    "id" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EaRosterReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerClubContextRevision" (
    "id" TEXT NOT NULL,
    "eaPlayerId" TEXT NOT NULL,
    "rosterReferenceId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerClubContextRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerClubContextSelection" (
    "eaPlayerId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "decisionReference" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PlayerClubContextSelection_pkey" PRIMARY KEY ("eaPlayerId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerClubContextRevision_eaPlayerId_id_key" ON "PlayerClubContextRevision"("eaPlayerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerClubContextRevision_eaPlayerId_contentHash_key" ON "PlayerClubContextRevision"("eaPlayerId", "contentHash");

-- AddForeignKey
ALTER TABLE "PlayerClubContextRevision" ADD CONSTRAINT "PlayerClubContextRevision_eaPlayerId_fkey" FOREIGN KEY ("eaPlayerId") REFERENCES "Player"("externalId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PlayerClubContextRevision" ADD CONSTRAINT "PlayerClubContextRevision_rosterReferenceId_fkey" FOREIGN KEY ("rosterReferenceId") REFERENCES "EaRosterReference"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PlayerClubContextSelection" ADD CONSTRAINT "PlayerClubContextSelection_eaPlayerId_fkey" FOREIGN KEY ("eaPlayerId") REFERENCES "Player"("externalId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PlayerClubContextSelection" ADD CONSTRAINT "PlayerClubContextSelection_eaPlayerId_revisionId_fkey" FOREIGN KEY ("eaPlayerId", "revisionId") REFERENCES "PlayerClubContextRevision"("eaPlayerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "EaRosterReference" ADD CONSTRAINT "roster_reference_metadata_identity"
  CHECK (COALESCE("metadata"->>'id' = id AND "metadata"->>'contentHash' = "contentHash"
    AND "contentHash" ~ '^[a-f0-9]{64}$', false));
ALTER TABLE "PlayerClubContextRevision" ADD CONSTRAINT "club_context_revision_identity"
  CHECK (COALESCE("payload"->>'eaPlayerId' = "eaPlayerId"
    AND "payload"#>>'{game,snapshot,id}' = "rosterReferenceId"
    AND "payload"#>>'{game,status}' IN ('CLUB','NG_FA','UNKNOWN')
    AND "payload" ? 'real' AND "contentHash" ~ '^[a-f0-9]{64}$', false));
ALTER TABLE "PlayerClubContextRevision" ADD CONSTRAINT "club_context_special_not_club"
  CHECK (COALESCE(CASE WHEN "payload"#>>'{game,status}' = 'CLUB'
    THEN "payload"#>>'{game,club,eaId}' <> '111592'
      AND ("payload"#>'{game,nativeTeamIds}') ? ("payload"#>>'{game,club,eaId}')
      AND ("payload"#>'{game,nativeClubTeamIds}') ? ("payload"#>>'{game,club,eaId}')
    ELSE "payload"#>'{game,club}' = 'null'::jsonb END, false));
ALTER TABLE "PlayerClubContextSelection" ADD CONSTRAINT "club_context_selection_decision"
  CHECK (length(trim("decisionReference")) > 0 AND version > 0);

CREATE FUNCTION reject_club_context_evidence_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'CLUB_CONTEXT_EVIDENCE_IMMUTABLE'; END; $$;
CREATE TRIGGER immutable_roster_reference BEFORE UPDATE OR DELETE ON "EaRosterReference"
  FOR EACH ROW EXECUTE FUNCTION reject_club_context_evidence_mutation();
CREATE TRIGGER immutable_club_context_revision BEFORE UPDATE OR DELETE ON "PlayerClubContextRevision"
  FOR EACH ROW EXECUTE FUNCTION reject_club_context_evidence_mutation();

CREATE FUNCTION validate_club_context_reference() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_metadata jsonb;
BEGIN
  SELECT metadata INTO source_metadata FROM "EaRosterReference" WHERE id = NEW."rosterReferenceId";
  IF source_metadata IS NULL OR NEW.payload#>'{game,snapshot}' IS DISTINCT FROM source_metadata THEN
    RAISE EXCEPTION 'CLUB_CONTEXT_REFERENCE_MISMATCH';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER validate_club_context_revision BEFORE INSERT ON "PlayerClubContextRevision"
  FOR EACH ROW EXECUTE FUNCTION validate_club_context_reference();

CREATE FUNCTION validate_club_context_selection_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."eaPlayerId" <> OLD."eaPlayerId" OR NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'CLUB_CONTEXT_SELECTION_VERSION_CONFLICT';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER validate_club_context_selection_update BEFORE UPDATE ON "PlayerClubContextSelection"
  FOR EACH ROW EXECUTE FUNCTION validate_club_context_selection_version();
