-- CreateTable
CREATE TABLE "SyncError" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "offset" INTEGER,
    "stage" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "payload" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncError_provider_idx" ON "SyncError"("provider");

-- CreateIndex
CREATE INDEX "SyncError_externalId_idx" ON "SyncError"("externalId");

-- CreateIndex
CREATE INDEX "SyncError_stage_idx" ON "SyncError"("stage");

-- CreateIndex
CREATE INDEX "SyncError_resolved_idx" ON "SyncError"("resolved");

-- CreateIndex
CREATE INDEX "SyncError_provider_resolved_idx" ON "SyncError"("provider", "resolved");
