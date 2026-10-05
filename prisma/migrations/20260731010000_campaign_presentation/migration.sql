-- CreateEnum
CREATE TYPE "CampaignColor" AS ENUM ('crimson', 'orange', 'gold', 'turquoise', 'cobalt', 'indigo', 'amethyst', 'silver');

-- CreateEnum
CREATE TYPE "CampaignTexture" AS ENUM ('none', 'texture_cyberpunk', 'texture_fallout', 'texture_fantasy', 'texture_steampunk');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "logo" TEXT,
ADD COLUMN     "logoKey" TEXT,
ADD COLUMN     "cover" TEXT,
ADD COLUMN     "coverKey" TEXT,
ADD COLUMN     "color" "CampaignColor" NOT NULL DEFAULT 'cobalt',
ADD COLUMN     "texture" "CampaignTexture" NOT NULL DEFAULT 'none';

-- CreateTable
CREATE TABLE "CampaignImage" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignImageCampaignId" ON "CampaignImage"("campaignId");

-- AddForeignKey
ALTER TABLE "CampaignImage" ADD CONSTRAINT "CampaignImage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
