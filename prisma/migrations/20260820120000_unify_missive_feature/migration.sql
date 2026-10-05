-- Unifica le due feature "missiveToCharacter"/"missiveToNpc" in un'unica
-- feature "missive" (FT_MISSIVE = "missive"). Nessuna campagna reale usa
-- ancora le due feature attuali (confermato con l'utente): nessun backfill
-- dati, si ripulisce lo stato vecchio.

-- AlterTable
ALTER TABLE "Character" DROP COLUMN "missiveToCharacterCount",
DROP COLUMN "missiveToNpcCount",
ADD COLUMN     "missiveCount" INTEGER NOT NULL DEFAULT 0;

-- Rimuove dal catalogo platform-wide i due `FeatureType` sostituiti dalla
-- feature unica "missive": la cascata (`onDelete: Cascade` su
-- `Feature.featureType`/`Action.feature`) elimina anche ogni `Feature`
-- di campagna e `Action` collegate, così non restano righe "morte" e
-- irraggiungibili nel catalogo (`prisma/seed.ts` fa solo upsert, non pulisce
-- mai le `FeatureType` non più registrate nel codice).
DELETE FROM "FeatureType" WHERE "functionName" IN ('missiveToCharacter', 'missiveToNpc');
