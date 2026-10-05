/*
  Warnings:

  - You are about to drop the column `actionName` on the `Action` table. All the data in the column will be lost.
  - You are about to drop the column `campaignId` on the `Action` table. All the data in the column will be lost.
  - You are about to drop the column `functionName` on the `Action` table. All the data in the column will be lost.
  - You are about to drop the `CharacterActionLog` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `characterId` to the `Action` table without a default value. This is not possible if the table is not empty.
  - Added the required column `creationDate` to the `Action` table without a default value. This is not possible if the table is not empty.
  - Added the required column `featureId` to the `Action` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status` to the `Action` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Action" DROP CONSTRAINT "Action_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "CharacterActionLog" DROP CONSTRAINT "CharacterActionLog_actionId_fkey";

-- DropIndex
DROP INDEX "ActionCampaignId";

-- AlterTable
ALTER TABLE "Action" DROP COLUMN "actionName",
DROP COLUMN "campaignId",
DROP COLUMN "functionName",
ADD COLUMN     "actionData" JSONB,
ADD COLUMN     "characterId" INTEGER NOT NULL,
ADD COLUMN     "completionDate" TIMESTAMP(3),
ADD COLUMN     "creationDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "featureId" INTEGER NOT NULL,
ADD COLUMN     "lastChangeDate" TIMESTAMP(3),
ADD COLUMN     "status" "ActionStatus" NOT NULL;

-- DropTable
DROP TABLE "CharacterActionLog";

-- CreateTable
CREATE TABLE "FeatureType" (
    "id" SERIAL NOT NULL,
    "featureName" TEXT NOT NULL,
    "functionName" TEXT NOT NULL,
    "actionSchema" JSONB NOT NULL,
    "featureSchema" JSONB NOT NULL,

    CONSTRAINT "FeatureType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feature" (
    "id" SERIAL NOT NULL,
    "featureTypeId" INTEGER NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "featureData" JSONB NOT NULL,

    CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionCampaignId" ON "Feature"("campaignId");

-- CreateIndex
CREATE INDEX "ActionCharacterId" ON "Action"("characterId");

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feature" ADD CONSTRAINT "Feature_featureTypeId_fkey" FOREIGN KEY ("featureTypeId") REFERENCES "FeatureType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feature" ADD CONSTRAINT "Feature_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
