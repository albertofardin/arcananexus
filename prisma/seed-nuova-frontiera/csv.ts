// Parser CSV RFC4180 scritto ad hoc (T-040): `wc -l`/uno split per riga
// sovrastimano le righe logiche di questi file — molti campi (descrizioni
// HTML da Google Docs) contengono virgole, virgolette e newline *dentro* un
// singolo campo. Nessuna nuova dipendenza: la piattaforma non ne ha già una
// per CSV in `package.json` (verificato prima di scrivere questo file).
//
// Comportamento RFC4180 implementato:
// - separatore di campo `,`, di record `\n` (anche `\r\n`, il `\r` viene
//   scartato) SOLO fuori da un campo quotato;
// - un campo può essere racchiuso tra `"`; dentro un campo quotato una `,`
//   o un newline sono testo, non un separatore;
// - `""` dentro un campo quotato è una virgoletta letterale (escape RFC4180).

// Stato del parser carattere per carattere: evita una regex (le regex per
// CSV con virgolette/escape sono notoriamente fragili sui casi limite che
// qui servono davvero, es. `"""Fede è Fortezza"""` in `table_fazioni.csv`).
export function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\r") {
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }

  // Ultimo campo/record se il file non termina con un newline (o se
  // l'ultimo campo prima di EOF è vuoto ma il record ha già altri campi).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

// Sentinella letterale vista nell'estrazione (es. `note_master` in
// `table_talenti.csv`): il gestionale di origine ha scritto la stringa
// "NULL" invece di lasciare il campo vuoto. Normalizzata a stringa vuota
// così i consumer (and/or/not_ids_talenti, descrizioni opzionali) non
// devono conoscere questo dettaglio del gestionale precedente.
function normalizeCell(value: string): string {
  const trimmed = value.trim();
  return trimmed.toUpperCase() === "NULL" ? "" : trimmed;
}

export class CsvHeaderMismatchError extends Error {
  constructor(rowIndex: number, expected: number, actual: number) {
    super(
      `Riga CSV ${rowIndex + 1}: ${actual} campi, attesi ${expected} (header). ` +
        "File corrotto o parser RFC4180 non ha gestito correttamente un campo quotato."
    );
    this.name = "CsvHeaderMismatchError";
  }
}

// Trasforma le righe grezze in oggetti header->valore (stile
// `csv.DictReader` di Python, usato durante l'analisi preliminare di questo
// task per verificare i conteggi attesi). Ogni riga deve avere lo stesso
// numero di campi dell'header: un mismatch è un errore esplicito (file
// diverso da quello atteso), non un troncamento silenzioso.
export function parseCsvRecords(content: string): Record<string, string>[] {
  const rows = parseCsvRows(content);
  if (rows.length === 0) return [];

  const [header, ...dataRows] = rows;
  return dataRows.map((row, index) => {
    if (row.length !== header.length) {
      throw new CsvHeaderMismatchError(index, header.length, row.length);
    }
    const record: Record<string, string> = {};
    header.forEach((key, col) => {
      record[key] = normalizeCell(row[col] ?? "");
    });
    return record;
  });
}

// Wrapper di comodo per i campi lista comma-separated del gestionale
// precedente (`and_ids_talenti`, `or_ids_talenti`, `not_ids_talenti`):
// stringa vuota (già normalizzata da `NULL` sopra) -> nessun id.
export function parseIdList(value: string): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map(part => part.trim())
    .filter(part => part.length > 0)
    .map(part => {
      const id = Number(part);
      if (!Number.isInteger(id)) {
        throw new Error(`Id non numerico in una lista CSV: "${part}"`);
      }
      return id;
    });
}
