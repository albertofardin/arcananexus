-- Campi richiesti dal plugin `admin` di Better Auth, adottato per sostituire
-- l'impersonation custom (cookie non firmati, rifiutati da Better Auth a
-- runtime - bug P0 T-010). Tutti i campi sono opzionali/nullable, migrazione
-- puramente additiva, nessun backfill necessario: il super-admin resta
-- individuato via `adminUserIds` (id hardcoded), non via `user.role`.

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "role" TEXT,
ADD COLUMN     "banned" BOOLEAN DEFAULT false,
ADD COLUMN     "banReason" TEXT,
ADD COLUMN     "banExpires" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "session" ADD COLUMN     "impersonatedBy" TEXT;
