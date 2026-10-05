-- `Action.characterId` diventa opzionale: il master può dichiarare una
-- missiva "a nome proprio" (nessun PG reale, `FT_MISSIVE` via
-- `POST /api/campaigns/[campaignSlug]/actions`) senza dover inventare un
-- personaggio fittizio come mittente.
ALTER TABLE "Action" ALTER COLUMN "characterId" DROP NOT NULL;
