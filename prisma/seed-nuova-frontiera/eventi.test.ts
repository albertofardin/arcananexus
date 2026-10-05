import { describe, it, expect } from "vitest";
import {
  parseCsvDate,
  derivePublicationDate,
  InvalidEventDateError,
} from "./eventi";

describe("parseCsvDate", () => {
  it("interpreta una data YYYY-MM-DD a mezzanotte UTC", () => {
    const date = parseCsvDate("2024-06-08", "4");
    expect(date.toISOString()).toBe("2024-06-08T00:00:00.000Z");
  });

  it("solleva un errore esplicito per una data non valida", () => {
    expect(() => parseCsvDate("non-una-data", "4")).toThrow(
      InvalidEventDateError
    );
  });
});

describe("derivePublicationDate", () => {
  it("usa 90 giorni prima di dateEventStart quando resta prima di datePublicationEnd", () => {
    const dateEventStart = parseCsvDate("2024-06-08", "4");
    const datePublicationEnd = parseCsvDate("2024-05-26", "4");
    const datePublicationStart = derivePublicationDate(
      dateEventStart,
      datePublicationEnd
    );

    expect(datePublicationStart.getTime()).toBeLessThan(
      datePublicationEnd.getTime()
    );
    expect(datePublicationStart.toISOString()).toBe("2024-03-10T00:00:00.000Z");
  });

  it("ricade su 7 giorni prima di datePublicationEnd se il criterio principale (90gg prima di dateEventStart) cadrebbe dopo datePublicationEnd", () => {
    // datePublicationEnd qui precede dateEventStart di più di 90 giorni (caso limite non
    // osservato nelle 8 righe reali, dove il distacco è di poche settimane):
    // "dateEventStart - 90 giorni" cadrebbe DOPO datePublicationEnd, quindi scatta il
    // fallback.
    const dateEventStart = parseCsvDate("2024-01-10", "x");
    const datePublicationEnd = parseCsvDate("2023-09-01", "x");
    const datePublicationStart = derivePublicationDate(
      dateEventStart,
      datePublicationEnd
    );

    expect(datePublicationStart.getTime()).toBeLessThan(
      datePublicationEnd.getTime()
    );
    expect(datePublicationStart.toISOString()).toBe("2023-08-25T00:00:00.000Z");
  });

  // Coppie (data_evento, scadenza_iscrizioni) delle 8 righe reali di
  // `table_eventi.csv` (verificate durante l'analisi preliminare): fissate
  // qui come fixture, non lette dal CSV — `table_eventi.csv` è committato
  // (catalogo, non PII), ma questo unit test resta hermetico invece di
  // accoppiarsi al contenuto del file su disco.
  const REAL_EVENT_DATE_PAIRS: [string, string][] = [
    ["2024-06-08", "2024-05-26"],
    ["2024-10-26", "2024-10-20"],
    ["2024-12-25", "2024-12-25"],
    ["2025-05-03", "2025-04-27"],
    ["2025-07-19", "2025-07-06"],
    ["2025-10-17", "2025-10-05"],
    ["2026-03-14", "2026-03-07"],
    ["2026-05-01", "2026-04-19"],
  ];

  it("resta sempre precedente a datePublicationEnd sulle 8 coppie di date reali dell'evento", () => {
    for (const [eventDateRaw, closeDateRaw] of REAL_EVENT_DATE_PAIRS) {
      const dateEventStart = parseCsvDate(eventDateRaw, "fixture");
      const datePublicationEnd = parseCsvDate(closeDateRaw, "fixture");
      const datePublicationStart = derivePublicationDate(
        dateEventStart,
        datePublicationEnd
      );
      expect(datePublicationStart.getTime()).toBeLessThan(
        datePublicationEnd.getTime()
      );
    }
  });
});
