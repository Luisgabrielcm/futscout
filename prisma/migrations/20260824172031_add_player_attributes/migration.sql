-- CreateTable
CREATE TABLE "PlayerAttributes" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "pace" INTEGER NOT NULL,
    "acceleration" INTEGER NOT NULL,
    "sprintSpeed" INTEGER NOT NULL,
    "shooting" INTEGER NOT NULL,
    "positioning" INTEGER NOT NULL,
    "finishing" INTEGER NOT NULL,
    "shotPower" INTEGER NOT NULL,
    "longShots" INTEGER NOT NULL,
    "volleys" INTEGER NOT NULL,
    "penalties" INTEGER NOT NULL,
    "passing" INTEGER NOT NULL,
    "vision" INTEGER NOT NULL,
    "crossing" INTEGER NOT NULL,
    "freeKickAccuracy" INTEGER NOT NULL,
    "shortPassing" INTEGER NOT NULL,
    "longPassing" INTEGER NOT NULL,
    "curve" INTEGER NOT NULL,
    "dribbling" INTEGER NOT NULL,
    "agility" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "reactions" INTEGER NOT NULL,
    "ballControl" INTEGER NOT NULL,
    "dribblingStat" INTEGER NOT NULL,
    "composure" INTEGER NOT NULL,
    "defending" INTEGER NOT NULL,
    "interceptions" INTEGER NOT NULL,
    "headingAccuracy" INTEGER NOT NULL,
    "defensiveAwareness" INTEGER NOT NULL,
    "standingTackle" INTEGER NOT NULL,
    "slidingTackle" INTEGER NOT NULL,
    "physical" INTEGER NOT NULL,
    "jumping" INTEGER NOT NULL,
    "stamina" INTEGER NOT NULL,
    "strength" INTEGER NOT NULL,
    "aggression" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerAttributes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerAttributes_playerId_key" ON "PlayerAttributes"("playerId");

-- AddForeignKey
ALTER TABLE "PlayerAttributes" ADD CONSTRAINT "PlayerAttributes_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
