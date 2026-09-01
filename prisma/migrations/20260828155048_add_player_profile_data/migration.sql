-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "secondaryPositions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "skillMoves" INTEGER,
ADD COLUMN     "weakFootAbility" INTEGER;
