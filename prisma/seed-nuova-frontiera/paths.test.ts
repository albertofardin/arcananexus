import { describe, it, expect } from "vitest";
import { readCatalogCsv, type CatalogCsvName } from "./paths";

// Verifica solo la barriera runtime (l'allowlist): il tipo `CatalogCsvName`
// è già la prima barriera a compile-time (i CSV con dati personali reali non
// compaiono nell'union — vedi commento in `paths.ts`, mai nominati qui per
// rispettare il vincolo PII anche nel codice di test), quindi il bypass va
// simulato con un cast su un nome qualsiasi non presente nell'allowlist —
// non serve che sia uno dei nomi PII veri per provare che il guard
// funziona. Non verifichiamo qui il percorso "file allowlisted esistente su
// disco": i 9 CSV di catalogo sono committati in
// `gdxhisfn_NuovaFrontiera.csv/`, ma leggerli qui accoppierebbe questo unit
// test al contenuto del CSV reale — lasciato alla verifica del seed stesso
// (`bunx prisma db seed`).
describe("readCatalogCsv allowlist (T-040)", () => {
  it("rifiuta qualunque nome non elencato nell'allowlist, anche forzando il tipo statico", () => {
    expect(() =>
      readCatalogCsv("table_not_in_allowlist" as unknown as CatalogCsvName)
    ).toThrow(/allowlist/i);
  });
});
