CREATE TABLE "EaPlayerRatingSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "playerId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "sourceContext" TEXT NOT NULL,
  "dateOfBirth" TIMESTAMP(3),
  "primaryPosition" TEXT NOT NULL,
  "overall" INTEGER NOT NULL CHECK ("overall" BETWEEN 1 AND 99),
  "attributes" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL CHECK ("contentHash" ~ '^[0-9a-f]{64}$'),
  "snapshotVersion" INTEGER NOT NULL DEFAULT 1 CHECK ("snapshotVersion" = 1),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EaPlayerRatingSnapshot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "ea_rating_snapshot_content_key" ON "EaPlayerRatingSnapshot"("externalId", "sourceContext", "snapshotVersion", "contentHash");
CREATE INDEX "EaPlayerRatingSnapshot_playerId_createdAt_idx" ON "EaPlayerRatingSnapshot"("playerId", "createdAt");
ALTER TABLE "EaPlayerCatalogObservation" ADD COLUMN "ratingSnapshotId" TEXT;
ALTER TABLE "EaPlayerCatalogObservation" ADD CONSTRAINT "EaPlayerCatalogObservation_ratingSnapshotId_fkey" FOREIGN KEY ("ratingSnapshotId") REFERENCES "EaPlayerRatingSnapshot"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX "EaPlayerCatalogObservation_ratingSnapshotId_idx" ON "EaPlayerCatalogObservation"("ratingSnapshotId");
CREATE FUNCTION ea_rating_snapshot_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'EA rating snapshots are immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER ea_rating_snapshot_immutable BEFORE UPDATE OR DELETE ON "EaPlayerRatingSnapshot"
FOR EACH ROW EXECUTE FUNCTION ea_rating_snapshot_immutable();

CREATE FUNCTION ea_rating_observation_link_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."ratingSnapshotId" IS NOT NULL AND
    (NEW."ratingSnapshotId", NEW."playerId", NEW."externalId", NEW."observationId") IS DISTINCT FROM
    (OLD."ratingSnapshotId", OLD."playerId", OLD."externalId", OLD."observationId") THEN
    RAISE EXCEPTION 'EA rating observation link is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW."ratingSnapshotId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "EaPlayerRatingSnapshot" s WHERE s."id" = NEW."ratingSnapshotId"
      AND s."playerId" = NEW."playerId" AND s."externalId" = NEW."externalId"
  ) THEN
    RAISE EXCEPTION 'EA rating observation identity mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ea_rating_observation_link_guard BEFORE INSERT OR UPDATE ON "EaPlayerCatalogObservation"
FOR EACH ROW EXECUTE FUNCTION ea_rating_observation_link_guard();
