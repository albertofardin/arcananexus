import { DataTypeKind } from "@prisma/client";
import z from "zod";

// Schemi Zod dei `flags` dichiarativi di `ReferenceData`, uno per `kind` di
// `DataType` (T-016). I `kind` sono un enum fisso lato codice (T-015): niente
// JSON-Schema autoriale / `ajv`, gli schemi sono codice — aggiungere un nuovo
// `kind` a schema.prisma richiede di aggiungere qui il suo schema flags.
const nonNegativeInt = z.number().int().nonnegative();

// Nessun flag dichiarato per questi `kind` (ancora): un oggetto vuoto è
// l'unico valore valido, coerente con `flags` opzionale/assente sul modello.
const emptyFlagsSchema = z.object({}).strict();

const originsFlagsSchema = z
  .object({
    startingPx: nonNegativeInt,
  })
  .strict();

const talentFlagsSchema = z
  .object({
    cost: nonNegativeInt,
    repeatable: z.boolean(),
    // Tetto di apprendimenti dello stesso talento se `repeatable`; assente =
    // ripetibile senza limite (comportamento pre-esistente).
    maxRepetitions: z.number().int().min(2).optional(),
    creationOnly: z.boolean(),
    // Etichetta di raggruppamento libera (es. "Sopravvivenza", "Classe
    // Segreta - Cavalieri"), opzionale: nessun talento pre-T-040 la aveva.
    // Popolata dall'import Nuova Frontiera da `talenti_categorie.nome`
    // (T-040); nessuna relazione/FK con un `DataType` dedicato — solo
    // un'etichetta cosmetica, la stessa filosofia di `flags` per gli altri
    // `kind` (dichiarativo, non normalizzato).
    category: z.string().trim().optional(),
    // Se attivo, un PG che possiede questo talento può usarlo come
    // tipologia di azione downtime (`DowntimeWriter`), invece di scegliere
    // solo tra le categorie configurate sulla `Feature` downtime.
    isDowntimeUsable: z.boolean(),
    // Se attivo, l'acquisizione del talento concede subito +1 punto
    // missiva/downtime utilizzabile e alza di 1 il massimale personale del
    // personaggio (`Character.missivePointsBonus`/`downtimePointsBonus`),
    // così il reset campagna non lo cancella — vedi
    // `assignReferenceDataToCharacter`/`resetCampaignPointsForActiveCharacters`.
    // Le checkbox sono nascoste in `FlagsForm` quando la relativa Feature
    // (`FT_MISSIVE`/`FT_DOWNTIME`) non è attiva per la campagna, ma il dato
    // resta comunque validato qui: un talento creato con la feature attiva
    // e poi disattivata non deve rompersi in validazione.
    isMissivePointBonus: z.boolean(),
    isDowntimePointBonus: z.boolean(),
  })
  .strict();

const flagsSchemaByKind: Record<DataTypeKind, z.ZodTypeAny> = {
  [DataTypeKind.generic]: emptyFlagsSchema,
  [DataTypeKind.origins]: originsFlagsSchema,
  [DataTypeKind.talent]: talentFlagsSchema,
  [DataTypeKind.assignable]: emptyFlagsSchema,
};

export function getFlagsSchemaForKind(kind: DataTypeKind): z.ZodTypeAny {
  return flagsSchemaByKind[kind];
}

// Un flag può essere "compagno" di un altro campo booleano dello stesso
// `kind` (es. `maxRepetitions` ha senso solo se `repeatable` è attivo):
// dichiarato qui, vicino agli schemi che definiscono questi nomi, così
// `FlagsForm` sa dove renderizzarlo (accanto al genitore, invece che sulla
// propria riga) senza conoscere i singoli nomi di flag per kind.
export const FLAG_FIELD_COMPANION_OF: Partial<Record<string, string>> = {
  maxRepetitions: "repeatable",
};

// `flags` è opzionale/nullable sul modello (`Json?`): l'assenza è equivalente
// a "nessun flag dichiarato", validata come oggetto vuoto contro lo schema
// del `kind` — per un `kind` senza flag passa, per uno con flag obbligatori
// (es. `talent`, `origins`) fallisce, segnalando che vanno forniti.
export function parseReferenceDataFlags(kind: DataTypeKind, flags: unknown) {
  return flagsSchemaByKind[kind].safeParse(flags ?? {});
}
