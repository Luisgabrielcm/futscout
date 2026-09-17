-- CreateEnum
CREATE TYPE "EaGameVersionEvidence" AS ENUM ('OFFICIAL_PAGE_CONTEXT', 'PAYLOAD');

-- CreateEnum
CREATE TYPE "EaSemanticSyncAction" AS ENUM ('CREATE', 'UPDATE', 'NO_OP', 'CONFLICT', 'INVALID');

-- CreateTable
CREATE TABLE "EaCatalogObservation" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "eaGameVersion" TEXT,
    "gameVersionEvidence" "EaGameVersionEvidence",
    "gameVersionEvidenceUrl" TEXT,
    "catalogVersion" TEXT,
    "sourceUpdatedAt" TIMESTAMP(3),
    "observedAt" TIMESTAMP(3) NOT NULL,
    "responseDate" TIMESTAMP(3),
    "etag" TEXT,
    "lastModified" TIMESTAMP(3),
    "locale" TEXT NOT NULL,
    "gender" INTEGER NOT NULL,
    "requestOffset" INTEGER NOT NULL,
    "requestLimit" INTEGER NOT NULL,
    "totalItems" INTEGER NOT NULL,
    "batchHash" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EaCatalogObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EaPlayerCatalogObservation" (
    "id" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "playerId" TEXT,
    "externalId" TEXT NOT NULL,
    "clubExternalId" TEXT,
    "leagueExternalId" TEXT,
    "leagueName" TEXT,
    "payloadHash" TEXT NOT NULL,
    "action" "EaSemanticSyncAction" NOT NULL,
    "changedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EaPlayerCatalogObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EaCatalogObservation_provider_eaGameVersion_observedAt_idx"
ON "EaCatalogObservation"("provider", "eaGameVersion", "observedAt" DESC);

-- CreateIndex
CREATE INDEX "EaCatalogObservation_provider_endpoint_locale_gender_requestOffset_requestLimit_observedAt_idx"
ON "EaCatalogObservation"("provider", "endpoint", "locale", "gender", "requestOffset", "requestLimit", "observedAt" DESC);

-- CreateIndex
CREATE INDEX "EaCatalogObservation_observedAt_idx"
ON "EaCatalogObservation"("observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EaPlayerCatalogObservation_observationId_externalId_key"
ON "EaPlayerCatalogObservation"("observationId", "externalId");

-- CreateIndex
CREATE INDEX "EaPlayerCatalogObservation_playerId_payloadHash_idx"
ON "EaPlayerCatalogObservation"("playerId", "payloadHash");

-- CreateIndex
CREATE INDEX "EaPlayerCatalogObservation_externalId_createdAt_idx"
ON "EaPlayerCatalogObservation"("externalId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "EaPlayerCatalogObservation_action_createdAt_idx"
ON "EaPlayerCatalogObservation"("action", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "EaPlayerCatalogObservation"
ADD CONSTRAINT "EaPlayerCatalogObservation_observationId_fkey"
FOREIGN KEY ("observationId") REFERENCES "EaCatalogObservation"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "EaPlayerCatalogObservation"
ADD CONSTRAINT "EaPlayerCatalogObservation_playerId_fkey"
FOREIGN KEY ("playerId") REFERENCES "Player"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;
