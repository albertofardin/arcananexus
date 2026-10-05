/*
  Warnings:

  - You are about to drop the column `visibilityConditionId` on the `CharacterData` table. All the data in the column will be lost.
  - You are about to drop the column `visibilityConditionId` on the `ReferenceData` table. All the data in the column will be lost.
  - You are about to drop the `VisibilityCondition` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RequirementType" ADD VALUE 'visibleWith';
ALTER TYPE "RequirementType" ADD VALUE 'grants';

-- DropForeignKey
ALTER TABLE "CharacterData" DROP CONSTRAINT "CharacterData_visibilityConditionId_fkey";

-- DropForeignKey
ALTER TABLE "ReferenceData" DROP CONSTRAINT "ReferenceData_visibilityConditionId_fkey";

-- AlterTable
ALTER TABLE "CharacterData" DROP COLUMN "visibilityConditionId";

-- AlterTable
ALTER TABLE "ReferenceData" DROP COLUMN "visibilityConditionId";

-- DropTable
DROP TABLE "VisibilityCondition";
