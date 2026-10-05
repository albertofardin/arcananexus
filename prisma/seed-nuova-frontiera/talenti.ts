import { parseIdList } from "./csv";

// Logica pura di risoluzione del grafo requisiti talenti (T-040): separata
// dalla scrittura DB (`index.ts`) per essere testabile senza Prisma — il
// pezzo più delicato dell'intero import (AND/OR/blocks + id CSV che possono
// non risolvere, vedi task).

export interface TalentoRow {
  id: string;
  nome: string;
  descrizione: string;
  costo_exp: string;
  id_talenti_categorie: string;
  and_ids_talenti: string;
  or_ids_talenti: string;
  not_ids_talenti: string;
  status: string;
}

export interface TalentiCategoriaRow {
  id: string;
  nome: string;
}

export class UnknownTalentiCategoriaError extends Error {
  constructor(idTalentiCategorie: string, talentoId: string) {
    super(
      `Talento id ${talentoId}: id_talenti_categorie "${idTalentiCategorie}" ` +
        "non risolve in table_talenti_categorie.csv."
    );
    this.name = "UnknownTalentiCategoriaError";
  }
}

// `talenti_categorie.nome` (destinato a `flags.category`, T-039) per un
// talento — un id che non risolve è un errore esplicito: a differenza dei
// riferimenti and/or/not (dove un id sganciato è un caso reale e documentato,
// una riga soft-cancellata nel gestionale precedente), `id_talenti_categorie`
// è un campo sempre valorizzato su tutte le 238 righe (verificato
// nell'analisi preliminare) — un mismatch qui segnala un CSV diverso da
// quello atteso, non un caso noto da tollerare.
export function resolveTalentoCategory(
  row: TalentoRow,
  categorie: TalentiCategoriaRow[]
): string {
  const categoria = categorie.find(c => c.id === row.id_talenti_categorie);
  if (!categoria) {
    throw new UnknownTalentiCategoriaError(row.id_talenti_categorie, row.id);
  }
  return categoria.nome;
}

// Un arco del grafo requisiti, ancora in id CSV (non risolti a id DB): il
// secondo passaggio in `index.ts` li traduce con la mappa
// `csvId -> ReferenceData.id` costruita durante l'import dei 238 talenti.
export interface RequirementDescriptor {
  definitionCsvId: number;
  requiredDefinitionCsvId: number;
  type: "requires" | "blocks";
  // `true` solo per le righe generate da `or_ids_talenti`: il chiamante userà
  // l'id DB della `definition` come `groupId` condiviso tra tutte le
  // alternative dello stesso talento (stabile e per costruzione univoco per
  // quella `definitionId`, vedi `DataRequirement.groupId` in schema.prisma).
  isOrGroup: boolean;
}

// Un riferimento (`and`/`or`/`not_ids_talenti`) che punta a un id CSV non
// presente tra le 238 righe reali: il gestionale precedente aveva righe
// soft-cancellate ancora referenziate altrove (vedi task, atteso — non un
// bug del parser). Raccolto invece di essere ignorato silenziosamente, per
// un log/conteggio finale nel seed.
export interface SkippedReference {
  definitionCsvId: number;
  requiredDefinitionCsvId: number;
  field: "and_ids_talenti" | "or_ids_talenti" | "not_ids_talenti";
}

export interface BuildTalentoRequirementsResult {
  requirements: RequirementDescriptor[];
  skipped: SkippedReference[];
}

// Costruisce l'intero grafo requisiti/blocchi da tutte le righe talenti in
// un colpo solo (serve l'intero insieme di id validi prima di poter
// distinguere un riferimento risolvibile da uno sganciato).
export function buildTalentoRequirements(
  rows: TalentoRow[]
): BuildTalentoRequirementsResult {
  const validCsvIds = new Set(rows.map(row => Number(row.id)));
  const requirements: RequirementDescriptor[] = [];
  const skipped: SkippedReference[] = [];

  // Risolve un campo (`and`/`or`/`not_ids_talenti`) in id CSV validi:
  // registra in `skipped` (senza generare requirement) ogni id che non
  // risolve tra le righe reali, e restituisce solo quelli validi — non
  // emette direttamente i `RequirementDescriptor`, per permettere al
  // chiamante di decidere (vedi `and`/`or` sotto: l'OR-group va valutato
  // per intero prima di sapere se va emesso).
  function resolveValidIds(
    definitionCsvId: number,
    field: SkippedReference["field"],
    rawValue: string
  ): number[] {
    const valid: number[] = [];
    for (const requiredDefinitionCsvId of parseIdList(rawValue)) {
      if (!validCsvIds.has(requiredDefinitionCsvId)) {
        skipped.push({ definitionCsvId, requiredDefinitionCsvId, field });
        continue;
      }
      valid.push(requiredDefinitionCsvId);
    }
    return valid;
  }

  for (const row of rows) {
    const definitionCsvId = Number(row.id);

    const andIds = resolveValidIds(
      definitionCsvId,
      "and_ids_talenti",
      row.and_ids_talenti
    );
    for (const requiredDefinitionCsvId of andIds) {
      requirements.push({
        definitionCsvId,
        requiredDefinitionCsvId,
        type: "requires",
        isOrGroup: false,
      });
    }

    // Un id condiviso tra `and_ids_talenti` e `or_ids_talenti` significa che
    // l'AND obbligatorio soddisfa già una delle alternative dell'OR-group:
    // l'intero gruppo è ridondante (non un vincolo aggiuntivo reale) e va
    // scartato per intero, non solo l'arco collidente — altrimenti gli altri
    // membri dell'OR-group resterebbero un vincolo indebito in più rispetto
    // alla fonte CSV (vedi task, 3 talenti reali col bug: "Cercatore",
    // "Ripresa Rapida", "Ferocia Primordiale - Volontà d'Acciaio").
    const orIds = resolveValidIds(
      definitionCsvId,
      "or_ids_talenti",
      row.or_ids_talenti
    );
    const andIdsSet = new Set(andIds);
    const orGroupAlreadySatisfiedByAnd = orIds.some(id => andIdsSet.has(id));
    if (!orGroupAlreadySatisfiedByAnd) {
      for (const requiredDefinitionCsvId of orIds) {
        requirements.push({
          definitionCsvId,
          requiredDefinitionCsvId,
          type: "requires",
          isOrGroup: true,
        });
      }
    }

    const notIds = resolveValidIds(
      definitionCsvId,
      "not_ids_talenti",
      row.not_ids_talenti
    );
    for (const requiredDefinitionCsvId of notIds) {
      requirements.push({
        definitionCsvId,
        requiredDefinitionCsvId,
        type: "blocks",
        isOrGroup: false,
      });
    }
  }

  return { requirements, skipped };
}
