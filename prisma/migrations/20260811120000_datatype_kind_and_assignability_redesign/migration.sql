-- T-047/T-048: redesign del `DataType.kind`/permesso di assegnazione.
--
-- kind: rimuove 'document' (mai avuto flags/logica dedicata, identico a
-- 'generic' a runtime), rinomina 'race' -> 'origins' (determina l'XP
-- iniziale, assegnabile dal giocatore solo in creazione), unisce
-- 'religion'/'faction' -> 'assignable' (indistinguibili a livello di codice
-- anche prima di questa migration).
--
-- Sostituisce inoltre `playerAssignable` (boolean) + `kindAssignable`
-- (nullable, introdotto solo per kind: "assignable") con un unico campo
-- NOT NULL `assignability` (`none`/`always`/`creationOnly`/`masterOnly`),
-- significativo per ogni kind, e rinomina `showInSidebar` -> `sidebarShow`.

BEGIN;

-- Data migration: le righe kind='document' esistenti diventano 'generic'.
UPDATE "DataType" SET kind = 'generic' WHERE kind = 'document';

-- Data migration: "Droghe" (id 27, campagna 6) è l'unica riga kind='generic'
-- con playerAssignable=true in produzione — un'anomalia rispetto
-- all'invariante "generic non è mai assegnabile" introdotta da questa
-- migration. Riclassificata ad 'assignable' insieme alle ex religion/
-- faction (stesso trattamento: erano già indistinguibili a livello di
-- codice). Riusa temporaneamente il valore enum 'religion' (ancora valido a
-- questo punto della transazione, prima dello swap di tipo sotto) così la
-- CASE dello swap la porta a 'assignable' insieme alle altre.
UPDATE "DataType" SET kind = 'religion' WHERE id = 27;

-- AlterEnum: DataTypeKind. generic/talent invariati; race -> origins
-- (rename); religion/faction -> assignable (merge); document -> generic
-- (rimosso).
CREATE TYPE "DataTypeKind_new" AS ENUM ('generic', 'origins', 'assignable', 'talent');
ALTER TABLE "DataType" ALTER COLUMN "kind" DROP DEFAULT;
ALTER TABLE "DataType" ALTER COLUMN "kind" TYPE "DataTypeKind_new" USING (
  CASE "kind"::text
    WHEN 'race' THEN 'origins'
    WHEN 'religion' THEN 'assignable'
    WHEN 'faction' THEN 'assignable'
    WHEN 'document' THEN 'generic'
    ELSE "kind"::text
  END
)::"DataTypeKind_new";
ALTER TYPE "DataTypeKind" RENAME TO "DataTypeKind_old";
ALTER TYPE "DataTypeKind_new" RENAME TO "DataTypeKind";
DROP TYPE "DataTypeKind_old";
ALTER TABLE "DataType" ALTER COLUMN "kind" SET DEFAULT 'generic';

-- CreateEnum: permesso di assegnazione, unifica playerAssignable +
-- kindAssignable (sotto).
CREATE TYPE "DataTypeAssignability" AS ENUM ('none', 'always', 'creationOnly', 'masterOnly');

-- AlterTable: nuova colonna (nullable finché non popolata riga per riga
-- sotto, poi NOT NULL).
ALTER TABLE "DataType" ADD COLUMN "assignability" "DataTypeAssignability";

-- Data migration: `assignability` per kind, dai valori pre-esistenti di
-- `playerAssignable`/dal `kind` stesso — nessun cambio di comportamento,
-- solo un campo esplicito al posto di uno implicito.
UPDATE "DataType" SET "assignability" = 'none' WHERE kind = 'generic';
UPDATE "DataType" SET "assignability" = 'creationOnly' WHERE kind = 'origins';
UPDATE "DataType" SET "assignability" = 'creationOnly' WHERE kind = 'assignable';
UPDATE "DataType" SET "assignability" = CASE
    WHEN "playerAssignable" THEN 'always'
    ELSE 'masterOnly'
  END::"DataTypeAssignability"
  WHERE kind = 'talent';

-- Data cleanup: alcune righe `kind: "generic"` legacy (pre-invariante T-035)
-- hanno una `cardinality` non-null residua pur non essendo mai assegnabili
-- (`playerAssignable` era già `false`) — innocuo a runtime (bloccate
-- comunque da `assignability: "none"`), ma incoerente con l'invariante
-- kind/assignability/cardinality ora applicata in codice: azzerata qui.
UPDATE "DataType" SET cardinality = NULL WHERE kind = 'generic' AND cardinality IS NOT NULL;

-- AlterTable: `assignability` NOT NULL con default, poi si può rimuovere
-- `playerAssignable` (ridondante, unificato sopra).
ALTER TABLE "DataType" ALTER COLUMN "assignability" SET DEFAULT 'none';
ALTER TABLE "DataType" ALTER COLUMN "assignability" SET NOT NULL;
ALTER TABLE "DataType" DROP COLUMN "playerAssignable";

-- AlterTable: rinomina showInSidebar -> sidebarShow.
ALTER TABLE "DataType" RENAME COLUMN "showInSidebar" TO "sidebarShow";

COMMIT;
