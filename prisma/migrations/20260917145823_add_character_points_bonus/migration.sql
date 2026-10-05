-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "downtimePointsBonus" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "missivePointsBonus" INTEGER NOT NULL DEFAULT 0;
