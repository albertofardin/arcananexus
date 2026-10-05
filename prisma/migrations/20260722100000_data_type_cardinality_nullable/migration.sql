-- T-035: `DataType.cardinality` diventa nullable. `playerAssignable` resta
-- l'unica fonte di verità su "assegnabile o no ai PG": `cardinality` è
-- significativo solo quando `playerAssignable = true`, altrimenti `null`
-- (invariante applicata a livello Zod, non a schema — vedi
-- `src/lib/validations/dataType.ts`). Rimosso anche il default `'multi'`:
-- una riga creata senza specificare `cardinality` ora resta `null` invece di
-- ereditare silenziosamente un valore non significativo quando
-- `playerAssignable` non è esplicitato.
-- Migrazione puramente additiva/di rilassamento del vincolo: nessuna riga
-- esistente viene toccata, `cardinality` resta invariato per i `DataType`
-- già presenti.
-- AlterTable
ALTER TABLE "DataType" ALTER COLUMN "cardinality" DROP NOT NULL,
ALTER COLUMN "cardinality" DROP DEFAULT;
