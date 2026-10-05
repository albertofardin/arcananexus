-- AlterTable
ALTER TABLE "Feature" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "Feature_featureTypeId_campaignId_key" ON "Feature"("featureTypeId", "campaignId");
