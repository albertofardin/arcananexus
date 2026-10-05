-- Allineamento nomi date evento + visibility (enum DataVisibility) al posto di hidden.
ALTER TABLE "Event" RENAME COLUMN "eventDate" TO "dateEventStart";
ALTER TABLE "Event" RENAME COLUMN "endDate" TO "dateEventEnd";
ALTER TABLE "Event" RENAME COLUMN "publicationDate" TO "datePublicationStart";
ALTER TABLE "Event" RENAME COLUMN "closeDate" TO "datePublicationEnd";

ALTER TABLE "Event" ADD COLUMN "visibility" "DataVisibility" NOT NULL DEFAULT 'visible';
UPDATE "Event" SET "visibility" = 'hidden' WHERE "hidden" = true;
ALTER TABLE "Event" DROP COLUMN "hidden";
