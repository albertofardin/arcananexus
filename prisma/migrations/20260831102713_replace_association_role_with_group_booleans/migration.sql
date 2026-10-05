-- Sostituisce l'enum AssociationRole (7 valori) con due booleani flat su "user":
-- isDirettivo (chi aveva un ruolo direttivo) e isDevWeb (cablato per email).
-- Ordine: aggiungi colonne -> backfill dai dati esistenti -> drop colonna/enum vecchi.

-- 1. Nuove colonne, default false
ALTER TABLE "user" ADD COLUMN "isDirettivo" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "isDevWeb" BOOLEAN NOT NULL DEFAULT false;

-- 2. Backfill: chi aveva un ruolo direttivo diventa isDirettivo
UPDATE "user" SET "isDirettivo" = true WHERE "associationRole" IN ('board','treasurer','vice_president','secretary','president');

-- 3. Backfill: le email cablate diventano isDevWeb (oltre al check hardcoded lato applicazione)
UPDATE "user" SET "isDevWeb" = true WHERE "email" IN ('mattia@arcana.it','prevalentementealberto@gmail.com');

-- 4. Drop colonna e tipo vecchi
ALTER TABLE "user" DROP COLUMN "associationRole";
DROP TYPE "AssociationRole";
