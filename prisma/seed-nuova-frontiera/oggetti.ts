// Split di `table_oggetti.csv` (923 righe) in 8 `DataType` per `categoria`
// (T-040, vedi task): logica pura, testabile senza DB — la scrittura vera e
// propria (creazione `DataType`/`ReferenceData`) vive in `index.ts`.

export interface OggettoRow {
  id: string;
  nome: string;
  categoria: string;
  tipologia: string;
  rarita: string;
  descrizione: string;
  status: string;
}

// `categoria` CSV -> nome del `DataType` di destinazione. `-nessuno-` è
// residuale (poche righe, quasi tutte `tipologia: trappola`) e viene
// fuso in "Oggetti" insieme alla categoria omonima, non in un nono
// `DataType` a parte.
const CATEGORIA_TO_DATATYPE_NAME: Record<string, string> = {
  ingrediente: "Ingredienti",
  oggetto: "Oggetti",
  "-nessuno-": "Oggetti",
  "oggetto incantato": "Oggetti Incantati",
  droga: "Droghe",
  malattia: "Malattie",
  "tonico da battaglia": "Tonici da Battaglia",
  speciale: "Oggetti Speciali",
  maledizione: "Maledizioni",
};

// Le 8 `DataType` risultanti (nomi distinti nella mappa sopra), nell'ordine
// in cui vanno create/mostrate in sidebar.
export const OGGETTI_DATATYPE_NAMES: readonly string[] = [
  "Ingredienti",
  "Oggetti",
  "Oggetti Incantati",
  "Droghe",
  "Malattie",
  "Tonici da Battaglia",
  "Oggetti Speciali",
  "Maledizioni",
];

export class UnknownCategoriaError extends Error {
  constructor(categoria: string, id: string) {
    super(
      `Categoria oggetto sconosciuta "${categoria}" (riga id ${id}): nessuna ` +
        "mappatura in CATEGORIA_TO_DATATYPE_NAME — aggiungerla o correggere il CSV."
    );
    this.name = "UnknownCategoriaError";
  }
}

// Il `DataType` di destinazione per una riga di `table_oggetti.csv`. Un
// `categoria` non mappato è un errore esplicito (elenco chiuso e verificato
// nell'analisi preliminare del task, non un fallback silenzioso su
// "Oggetti").
export function resolveOggettoDataTypeName(row: OggettoRow): string {
  const name = CATEGORIA_TO_DATATYPE_NAME[row.categoria];
  if (!name) {
    throw new UnknownCategoriaError(row.categoria, row.id);
  }
  return name;
}

const RARITA_LABELS: Record<string, string> = {
  C: "Comune",
  NC: "Non Comune",
  R: "Raro",
  L: "Leggendario",
};

// Compone `ReferenceData.description` da `descrizione` + `tipologia` (se
// non vuota) + `rarità` (mappata in etichetta IT, `-nessuno-`/valore ignoto
// ignorati — non è un attributo dichiarato per queste voci, restano `kind:
// generic` senza flag nuovi, vedi `referenceDataFlags.ts`).
export function buildOggettoDescription(row: OggettoRow): string {
  const lines = [row.descrizione.trim()].filter(Boolean);
  if (row.tipologia.trim()) {
    lines.push(`Tipologia: ${row.tipologia.trim()}`);
  }
  const raritaLabel = RARITA_LABELS[row.rarita.trim()];
  if (raritaLabel) {
    lines.push(`Rarità: ${raritaLabel}`);
  }
  return lines.join("\n");
}
