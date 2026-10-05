-- endDate obbligatoria (eventi esistenti: fine = inizio) e descriptionShort rimossa.
UPDATE "Event" SET "endDate" = "eventDate" WHERE "endDate" IS NULL;
ALTER TABLE "Event" ALTER COLUMN "endDate" SET NOT NULL;
ALTER TABLE "Event" DROP COLUMN "descriptionShort";
