import fs from "node:fs";
import path from "node:path";
import { parseCsvRecords } from "./csv";

// Estrazione del gestionale precedente (root del repo, MAI committata — vedi
// `.gitignore`): contiene anche 5 CSV con dati personali reali
// (utenti/personaggi/PNG/iscrizioni eventi/downtime), fuori scope assoluto
// per questo task (T-040, vincolo PII). L'allowlist sotto è la barriera
// tecnica contro un refuso: `readCatalogCsv` rifiuta qualunque nome non
// elencato qui, quindi anche un errore di battitura non può far leggere
// accidentalmente uno dei file PII — che per costruzione non compare mai in
// questo elenco, in questo modulo, o altrove nel seed.
const CSV_DIR = path.join(process.cwd(), "gdxhisfn_NuovaFrontiera.csv");

export type CatalogCsvName =
  | "table_razze"
  | "table_fazioni"
  | "table_divinita"
  | "table_talenti_categorie"
  | "table_talenti"
  | "table_dicerie"
  | "table_oggetti"
  | "table_eventi"
  | "table_azioni_downtime";

const ALLOWED_CSV_NAMES: ReadonlySet<CatalogCsvName> = new Set([
  "table_razze",
  "table_fazioni",
  "table_divinita",
  "table_talenti_categorie",
  "table_talenti",
  "table_dicerie",
  "table_oggetti",
  "table_eventi",
  "table_azioni_downtime",
]);

export class CsvFileNotFoundError extends Error {
  constructor(name: string, fullPath: string) {
    super(
      `CSV "${name}" non trovato in ${fullPath}. Verifica che la cartella ` +
        "gdxhisfn_NuovaFrontiera.csv/ esista nella root del repo (non è " +
        "committata, vedi .gitignore)."
    );
    this.name = "CsvFileNotFoundError";
  }
}

// Unico punto di lettura da disco per questo seed: `name` è vincolato al
// literal union type sopra, quindi un file PII (assente dall'union) è un
// errore di compilazione, non solo a runtime.
export function readCatalogCsv(name: CatalogCsvName): Record<string, string>[] {
  if (!ALLOWED_CSV_NAMES.has(name)) {
    // Difesa in profondità: raggiungibile solo forzando il tipo (`as`), il
    // tipo statico sopra è già la prima barriera.
    throw new Error(`CSV "${name}" non è nell'allowlist di import consentiti.`);
  }
  const fullPath = path.join(CSV_DIR, `gdxhisfn_NuovaFrontiera_${name}.csv`);
  if (!fs.existsSync(fullPath)) {
    throw new CsvFileNotFoundError(name, fullPath);
  }
  const content = fs.readFileSync(fullPath, "utf-8");
  return parseCsvRecords(content);
}
