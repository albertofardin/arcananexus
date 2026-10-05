-- Rinomina la colonna "isDevWeb" in "isSviluppo" sulla tabella "user": stesso
-- significato (gruppo "Sviluppo Web"), solo la chiave applicativa cambia
-- nome. Nessun backfill necessario: è un puro rename di colonna, i valori
-- esistenti restano invariati.
ALTER TABLE "user" RENAME COLUMN "isDevWeb" TO "isSviluppo";
