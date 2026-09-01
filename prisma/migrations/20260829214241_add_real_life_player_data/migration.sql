/*
  Warnings:

  - A unique constraint covering the columns `[apiFootballId]` on the table `Player` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "apiFootballId" INTEGER;

-- CreateTable
CREATE TABLE "PlayerRealLifeStat" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "apiTeamId" INTEGER,
    "apiLeagueId" INTEGER,
    "season" INTEGER NOT NULL,
    "teamName" TEXT NOT NULL,
    "teamLogoUrl" TEXT,
    "competitionName" TEXT NOT NULL,
    "competitionCountry" TEXT,
    "competitionLogoUrl" TEXT,
    "competitionFlagUrl" TEXT,
    "position" TEXT,
    "appearances" INTEGER,
    "lineups" INTEGER,
    "minutes" INTEGER,
    "rating" DOUBLE PRECISION,
    "goals" INTEGER,
    "assists" INTEGER,
    "shots" INTEGER,
    "shotsOnTarget" INTEGER,
    "passes" INTEGER,
    "keyPasses" INTEGER,
    "passAccuracy" INTEGER,
    "tackles" INTEGER,
    "interceptions" INTEGER,
    "duels" INTEGER,
    "duelsWon" INTEGER,
    "dribbles" INTEGER,
    "dribblesSuccess" INTEGER,
    "foulsDrawn" INTEGER,
    "foulsCommitted" INTEGER,
    "yellowCards" INTEGER,
    "redCards" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerRealLifeStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerTransfer" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "transferDate" TIMESTAMP(3) NOT NULL,
    "fromTeamApiId" INTEGER,
    "fromTeamName" TEXT NOT NULL,
    "fromTeamLogo" TEXT,
    "toTeamApiId" INTEGER,
    "toTeamName" TEXT NOT NULL,
    "toTeamLogo" TEXT,
    "rawTransferType" TEXT,
    "transferValue" BIGINT,
    "transferCurrency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerTrophy" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "country" TEXT,
    "competition" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "place" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerTrophy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerRealLifeStat_playerId_idx" ON "PlayerRealLifeStat"("playerId");

-- CreateIndex
CREATE INDEX "PlayerRealLifeStat_season_idx" ON "PlayerRealLifeStat"("season");

-- CreateIndex
CREATE INDEX "PlayerRealLifeStat_apiTeamId_idx" ON "PlayerRealLifeStat"("apiTeamId");

-- CreateIndex
CREATE INDEX "PlayerRealLifeStat_apiLeagueId_idx" ON "PlayerRealLifeStat"("apiLeagueId");

-- CreateIndex
CREATE INDEX "PlayerRealLifeStat_playerId_season_idx" ON "PlayerRealLifeStat"("playerId", "season");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerRealLifeStat_playerId_season_apiTeamId_apiLeagueId_key" ON "PlayerRealLifeStat"("playerId", "season", "apiTeamId", "apiLeagueId");

-- CreateIndex
CREATE INDEX "PlayerTransfer_playerId_idx" ON "PlayerTransfer"("playerId");

-- CreateIndex
CREATE INDEX "PlayerTransfer_transferDate_idx" ON "PlayerTransfer"("transferDate");

-- CreateIndex
CREATE INDEX "PlayerTransfer_fromTeamApiId_idx" ON "PlayerTransfer"("fromTeamApiId");

-- CreateIndex
CREATE INDEX "PlayerTransfer_toTeamApiId_idx" ON "PlayerTransfer"("toTeamApiId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerTransfer_playerId_transferDate_fromTeamName_toTeamNam_key" ON "PlayerTransfer"("playerId", "transferDate", "fromTeamName", "toTeamName");

-- CreateIndex
CREATE INDEX "PlayerTrophy_playerId_idx" ON "PlayerTrophy"("playerId");

-- CreateIndex
CREATE INDEX "PlayerTrophy_competition_idx" ON "PlayerTrophy"("competition");

-- CreateIndex
CREATE INDEX "PlayerTrophy_season_idx" ON "PlayerTrophy"("season");

-- CreateIndex
CREATE INDEX "PlayerTrophy_place_idx" ON "PlayerTrophy"("place");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerTrophy_playerId_country_competition_season_place_key" ON "PlayerTrophy"("playerId", "country", "competition", "season", "place");

-- CreateIndex
CREATE UNIQUE INDEX "Player_apiFootballId_key" ON "Player"("apiFootballId");

-- CreateIndex
CREATE INDEX "Player_apiFootballId_idx" ON "Player"("apiFootballId");

-- AddForeignKey
ALTER TABLE "PlayerRealLifeStat" ADD CONSTRAINT "PlayerRealLifeStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerTransfer" ADD CONSTRAINT "PlayerTransfer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerTrophy" ADD CONSTRAINT "PlayerTrophy_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
