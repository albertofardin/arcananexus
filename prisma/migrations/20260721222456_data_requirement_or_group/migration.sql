-- AlterTable
ALTER TABLE "DataRequirement" ADD COLUMN     "groupId" INTEGER;

-- AlterTable
ALTER TABLE "PersonalData" ADD COLUMN     "guardianEmail" TEXT,
ADD COLUMN     "guardianName" TEXT,
ADD COLUMN     "guardianPhone" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "phone" TEXT;
