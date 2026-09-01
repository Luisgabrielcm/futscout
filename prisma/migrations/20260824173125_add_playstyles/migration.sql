-- CreateTable
CREATE TABLE "PlayStyle" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayStyle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerPlayStyle" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "playStyleId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerPlayStyle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayStyle_externalId_key" ON "PlayStyle"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayStyle_code_key" ON "PlayStyle"("code");

-- CreateIndex
CREATE INDEX "PlayerPlayStyle_playerId_idx" ON "PlayerPlayStyle"("playerId");

-- CreateIndex
CREATE INDEX "PlayerPlayStyle_playStyleId_idx" ON "PlayerPlayStyle"("playStyleId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerPlayStyle_playerId_playStyleId_key" ON "PlayerPlayStyle"("playerId", "playStyleId");

-- AddForeignKey
ALTER TABLE "PlayerPlayStyle" ADD CONSTRAINT "PlayerPlayStyle_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPlayStyle" ADD CONSTRAINT "PlayerPlayStyle_playStyleId_fkey" FOREIGN KEY ("playStyleId") REFERENCES "PlayStyle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
