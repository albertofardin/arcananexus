-- Evento non più obbligatoriamente legato a una campagna: il tenant diventa
-- `organizationId` (backfill dalla campagna esistente).
ALTER TABLE "Event" ADD COLUMN "organizationId" INTEGER;
UPDATE "Event" e SET "organizationId" = c."organizationId" FROM "Campaign" c WHERE c."id" = e."campaignId";
ALTER TABLE "Event" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Event" ALTER COLUMN "campaignId" DROP NOT NULL;
ALTER TABLE "Event" ADD COLUMN "endDate" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN "price" DECIMAL(65,30) NOT NULL DEFAULT 0;
CREATE INDEX "EventOrganizationId" ON "Event"("organizationId");
ALTER TABLE "Event" ADD CONSTRAINT "Event_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Booking" ADD COLUMN "addedByStaff" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "Booking_eventId_userId_key" ON "Booking"("eventId", "userId");
