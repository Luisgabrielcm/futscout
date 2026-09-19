-- AddTable: dedicated EA goalkeeper ratings. No backfill or domain update.
CREATE TABLE "PlayerGoalkeeperAttributes" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "diving" INTEGER NOT NULL,
    "handling" INTEGER NOT NULL,
    "kicking" INTEGER NOT NULL,
    "positioning" INTEGER NOT NULL,
    "reflexes" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "sourceObservationId" TEXT,
    "sourceUpdatedAt" TIMESTAMP(3),
    "observedAt" TIMESTAMP(3) NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerGoalkeeperAttributes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PlayerGoalkeeperAttributes_diving_range" CHECK ("diving" BETWEEN 0 AND 99),
    CONSTRAINT "PlayerGoalkeeperAttributes_handling_range" CHECK ("handling" BETWEEN 0 AND 99),
    CONSTRAINT "PlayerGoalkeeperAttributes_kicking_range" CHECK ("kicking" BETWEEN 0 AND 99),
    CONSTRAINT "PlayerGoalkeeperAttributes_positioning_range" CHECK ("positioning" BETWEEN 0 AND 99),
    CONSTRAINT "PlayerGoalkeeperAttributes_reflexes_range" CHECK ("reflexes" BETWEEN 0 AND 99)
);

CREATE UNIQUE INDEX "PlayerGoalkeeperAttributes_playerId_key"
ON "PlayerGoalkeeperAttributes"("playerId");

CREATE INDEX "PlayerGoalkeeperAttributes_provider_observedAt_idx"
ON "PlayerGoalkeeperAttributes"("provider", "observedAt" DESC);

CREATE INDEX "PlayerGoalkeeperAttributes_sourceObservationId_idx"
ON "PlayerGoalkeeperAttributes"("sourceObservationId");

CREATE INDEX "PlayerGoalkeeperAttributes_payloadHash_idx"
ON "PlayerGoalkeeperAttributes"("payloadHash");

ALTER TABLE "PlayerGoalkeeperAttributes"
ADD CONSTRAINT "PlayerGoalkeeperAttributes_playerId_fkey"
FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlayerGoalkeeperAttributes"
ADD CONSTRAINT "PlayerGoalkeeperAttributes_sourceObservationId_fkey"
FOREIGN KEY ("sourceObservationId") REFERENCES "EaCatalogObservation"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
