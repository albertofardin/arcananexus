-- Rinomina `Character.missiveCount` in `missivePoints` per uniformare il
-- naming al pattern già usato da `downtimePoints`: entrambi sono un saldo
-- spendibile (punti), non un semplice conteggio di eventi passati.
ALTER TABLE "Character" RENAME COLUMN "missiveCount" TO "missivePoints";
