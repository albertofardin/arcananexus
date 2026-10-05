-- AlterEnum
ALTER TYPE "EventPriceCondition" ADD VALUE 'under25';

-- CreateTable (FK target must exist before Campaign references it)
CREATE TABLE "Organization" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "OrganizationSlug" ON "Organization"("slug");

-- Reference data: default "arcana-domine" organization pinned to id = 1.
-- Idempotent so it is safe on databases where the org already exists (e.g. dev seeded via prisma db seed).
INSERT INTO "Organization" ("id", "name", "slug", "description", "updatedAt")
VALUES (1, 'Arcana Domine', 'arcana-domine', 'Official Arcana Domine LARP organization', CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

-- Keep the id sequence ahead of the explicitly-inserted row so future inserts do not collide.
SELECT setval(pg_get_serial_sequence('"Organization"', 'id'), (SELECT MAX("id") FROM "Organization"));

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "paymentDate" TIMESTAMP(3);

-- AlterTable: add new Campaign columns.
--   organizationId defaults to 1 (the arcana-domine org) so existing rows and future inserts fall back to it.
--   createdAt keeps its default (matches @default(now())).
--   slug / updatedAt are added nullable first, backfilled, then constrained (no permanent default, matches the datamodel).
ALTER TABLE "Campaign" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "organizationId" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- Backfill: carry the old urlSlag values into slug, and stamp updatedAt for existing rows.
UPDATE "Campaign" SET "slug" = "urlSlag" WHERE "slug" IS NULL;
UPDATE "Campaign" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;

-- Enforce NOT NULL now that every row has a value, then drop the retired column.
ALTER TABLE "Campaign" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "Campaign" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "Campaign" DROP COLUMN "urlSlag";

-- CreateIndex
CREATE INDEX "CampaignOrganizationId" ON "Campaign"("organizationId");

-- CreateIndex
CREATE INDEX "CampaignSlug" ON "Campaign"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_organizationId_slug_key" ON "Campaign"("organizationId", "slug");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
