-- CreateTable
CREATE TABLE "ApiFootballPlayerMatchAttempt" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastApiFootballId" INTEGER,
    "lastConfidence" INTEGER,
    "lastNameScore" INTEGER,
    "lastBirthMatches" BOOLEAN,
    "lastNationalityMatches" BOOLEAN,
    "lastClubMatches" BOOLEAN,
    "lastReason" TEXT,
    "lastTriedAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiFootballPlayerMatchAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiFootballPlayerMatchAttempt_playerId_key" ON "ApiFootballPlayerMatchAttempt"("playerId");

-- CreateIndex
CREATE INDEX "ApiFootballPlayerMatchAttempt_status_idx" ON "ApiFootballPlayerMatchAttempt"("status");

-- CreateIndex
CREATE INDEX "ApiFootballPlayerMatchAttempt_nextRetryAt_idx" ON "ApiFootballPlayerMatchAttempt"("nextRetryAt");

-- CreateIndex
CREATE INDEX "ApiFootballPlayerMatchAttempt_lastTriedAt_idx" ON "ApiFootballPlayerMatchAttempt"("lastTriedAt");

-- CreateIndex
CREATE INDEX "ApiFootballPlayerMatchAttempt_status_nextRetryAt_idx" ON "ApiFootballPlayerMatchAttempt"("status", "nextRetryAt");

-- AddForeignKey
ALTER TABLE "ApiFootballPlayerMatchAttempt" ADD CONSTRAINT "ApiFootballPlayerMatchAttempt_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
