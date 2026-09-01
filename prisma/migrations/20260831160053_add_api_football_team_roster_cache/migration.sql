-- CreateTable
CREATE TABLE "ApiFootballTeamRosterCache" (
    "id" TEXT NOT NULL,
    "apiTeamId" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "players" JSONB NOT NULL,
    "playerCount" INTEGER NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiFootballTeamRosterCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiFootballTeamRosterCache_apiTeamId_idx" ON "ApiFootballTeamRosterCache"("apiTeamId");

-- CreateIndex
CREATE INDEX "ApiFootballTeamRosterCache_season_idx" ON "ApiFootballTeamRosterCache"("season");

-- CreateIndex
CREATE INDEX "ApiFootballTeamRosterCache_expiresAt_idx" ON "ApiFootballTeamRosterCache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiFootballTeamRosterCache_apiTeamId_season_key" ON "ApiFootballTeamRosterCache"("apiTeamId", "season");
