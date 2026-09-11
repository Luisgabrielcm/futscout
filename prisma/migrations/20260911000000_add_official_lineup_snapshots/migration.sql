-- Additive only. Prepared offline; NOT applied by Lote 7.4 Fase B.
CREATE TABLE "ClubOfficialLineupSnapshot" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "fixtureExternalId" INTEGER NOT NULL,
    "teamExternalId" INTEGER NOT NULL,
    "fixtureDate" TIMESTAMP(3) NOT NULL,
    "formation" TEXT,
    "revision" INTEGER NOT NULL,
    "payloadVersion" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClubOfficialLineupSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "official_lineup_revision_key" ON "ClubOfficialLineupSnapshot"("provider", "fixtureExternalId", "teamExternalId", "revision");
CREATE INDEX "official_lineup_club_latest_idx" ON "ClubOfficialLineupSnapshot"("clubId", "fixtureDate" DESC, "fetchedAt" DESC);
CREATE INDEX "official_lineup_hash_idx" ON "ClubOfficialLineupSnapshot"("provider", "fixtureExternalId", "teamExternalId", "contentHash");
ALTER TABLE "ClubOfficialLineupSnapshot" ADD CONSTRAINT "ClubOfficialLineupSnapshot_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
