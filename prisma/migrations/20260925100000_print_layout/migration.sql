-- CreateEnum
CREATE TYPE "PrintLayoutSource" AS ENUM ('character', 'reference', 'free');

-- CreateEnum
CREATE TYPE "PrintSheet" AS ENUM ('none', 'a4_portrait', 'a4_landscape', 'a3_portrait', 'a3_landscape');

-- CreateTable
CREATE TABLE "PrintLayout" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "source" "PrintLayoutSource" NOT NULL,
    "name" TEXT NOT NULL,
    "template" JSONB NOT NULL,
    "sheet" "PrintSheet" NOT NULL DEFAULT 'none',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrintLayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrintLayoutCampaignId" ON "PrintLayout"("campaignId");

-- AddForeignKey
ALTER TABLE "PrintLayout" ADD CONSTRAINT "PrintLayout_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

