-- CreateEnum
CREATE TYPE "CurrentClubProposalStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'REVIEW', 'CONFLICT');

-- CreateTable
CREATE TABLE "PlayerCurrentClubProposal" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "providerPlayerId" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "baseApprovedVersion" INTEGER NOT NULL,
    "proposedClubId" TEXT,
    "proposedProviderTeamId" INTEGER,
    "effectiveSince" TIMESTAMP(3),
    "decision" TEXT NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "observationHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "policyVersion" TEXT NOT NULL,
    "replacementPolicy" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supportingEvidence" JSONB NOT NULL,
    "contradictingEvidence" JSONB NOT NULL,
    "status" "CurrentClubProposalStatus" NOT NULL,
    "statusReason" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "supersededById" TEXT,
    "sourceLegacyStateId" TEXT,

    CONSTRAINT "PlayerCurrentClubProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerApprovedCurrentClub" (
    "playerId" TEXT NOT NULL,
    "approvedClubId" TEXT,
    "approvedProviderTeamId" INTEGER,
    "effectiveSince" TIMESTAMP(3),
    "evidenceHash" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sourceProposalId" TEXT NOT NULL,

    CONSTRAINT "PlayerApprovedCurrentClub_pkey" PRIMARY KEY ("playerId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerCurrentClubProposal_sourceLegacyStateId_key" ON "PlayerCurrentClubProposal"("sourceLegacyStateId");

-- CreateIndex
CREATE INDEX "PlayerCurrentClubProposal_playerId_status_evaluatedAt_idx" ON "PlayerCurrentClubProposal"("playerId", "status", "evaluatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerCurrentClubProposal_id_playerId_key" ON "PlayerCurrentClubProposal"("id", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerCurrentClubProposal_playerId_revision_key" ON "PlayerCurrentClubProposal"("playerId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerApprovedCurrentClub_sourceProposalId_key" ON "PlayerApprovedCurrentClub"("sourceProposalId");

-- CreateIndex
CREATE INDEX "PlayerApprovedCurrentClub_approvedClubId_idx" ON "PlayerApprovedCurrentClub"("approvedClubId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerApprovedCurrentClub_sourceProposalId_playerId_key" ON "PlayerApprovedCurrentClub"("sourceProposalId", "playerId");

-- AddForeignKey
ALTER TABLE "PlayerCurrentClubProposal" ADD CONSTRAINT "PlayerCurrentClubProposal_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PlayerCurrentClubProposal" ADD CONSTRAINT "PlayerCurrentClubProposal_proposedClubId_fkey" FOREIGN KEY ("proposedClubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PlayerCurrentClubProposal" ADD CONSTRAINT "PlayerCurrentClubProposal_supersededById_playerId_fkey" FOREIGN KEY ("supersededById", "playerId") REFERENCES "PlayerCurrentClubProposal"("id", "playerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PlayerApprovedCurrentClub" ADD CONSTRAINT "PlayerApprovedCurrentClub_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PlayerApprovedCurrentClub" ADD CONSTRAINT "PlayerApprovedCurrentClub_approvedClubId_fkey" FOREIGN KEY ("approvedClubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PlayerApprovedCurrentClub" ADD CONSTRAINT "PlayerApprovedCurrentClub_sourceProposalId_playerId_fkey" FOREIGN KEY ("sourceProposalId", "playerId") REFERENCES "PlayerCurrentClubProposal"("id", "playerId") ON DELETE RESTRICT ON UPDATE RESTRICT;
