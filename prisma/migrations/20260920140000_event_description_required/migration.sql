-- descriptionFull -> description, obbligatoria (gli eventi esistenti senza testo ricevono una stringa vuota).
ALTER TABLE "Event" RENAME COLUMN "descriptionFull" TO "description";
UPDATE "Event" SET "description" = '' WHERE "description" IS NULL;
ALTER TABLE "Event" ALTER COLUMN "description" SET NOT NULL;
