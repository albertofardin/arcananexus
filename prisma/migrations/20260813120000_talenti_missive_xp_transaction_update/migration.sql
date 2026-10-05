-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "downtimePoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "missiveToCharacterCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "missiveToNpcCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "XpTransaction" ADD COLUMN     "note" TEXT,
ADD COLUMN     "updatedById" TEXT;

-- AddForeignKey
ALTER TABLE "XpTransaction" ADD CONSTRAINT "XpTransaction_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rinomina il valore enum "adjustment" -> "update": una rettifica manuale
-- del master su un PG (in creazione o già esistente) non è la "correzione di
-- un errore" che il termine "rettifica"/"adjustment" suggeriva, ma un
-- semplice aggiornamento del saldo XP concesso dallo staff.
ALTER TYPE "XpReason" RENAME VALUE 'adjustment' TO 'update';

-- Rinomina `FeatureType.functionName`: "downtimeLearnTalent" -> "learnTalent",
-- "downtimeMissiveToCharacter" -> "missiveToCharacter",
-- "downtimeMissiveToNpc" -> "missiveToNpc" (src/lib/features/featuresName.ts,
-- FT_LEARN_TALENT / FT_MISSIVE_TO_PG / FT_MISSIVE_TO_NPC): senza questi update,
-- le campagne che avevano già attivato queste Feature le perderebbero
-- (getFeatureByFunctionName non le trova più).
UPDATE "FeatureType" SET "functionName" = 'learnTalent' WHERE "functionName" = 'downtimeLearnTalent';
UPDATE "FeatureType" SET "functionName" = 'missiveToCharacter' WHERE "functionName" = 'downtimeMissiveToCharacter';
UPDATE "FeatureType" SET "functionName" = 'missiveToNpc' WHERE "functionName" = 'downtimeMissiveToNpc';
