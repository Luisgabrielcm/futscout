/*
  Warnings:

  - A unique constraint covering the columns `[apiFootballId]` on the table `Club` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "apiFootballId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Club_apiFootballId_key" ON "Club"("apiFootballId");

-- CreateIndex
CREATE INDEX "Club_apiFootballId_idx" ON "Club"("apiFootballId");
