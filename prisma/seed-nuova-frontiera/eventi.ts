// Logica pura per l'import di `table_eventi.csv` (8 righe reali, T-040):
// parsing data + derivazione `datePublicationStart` (assente nel CSV, campo
// obbligatorio a schema — `Event.datePublicationStart`).

export interface EventoRow {
  id: string;
  nome: string;
  descrizione: string;
  descrizione_completa: string;
  data_evento: string;
  scadenza_iscrizioni: string;
  luogo_evento: string;
  status: string;
}

export class InvalidEventDateError extends Error {
  constructor(value: string, eventoId: string) {
    super(`Evento id ${eventoId}: data non valida "${value}".`);
    this.name = "InvalidEventDateError";
  }
}

// Le date del CSV sono `YYYY-MM-DD` (nessun orario): interpretate a
// mezzanotte UTC, come gli altri `Date` costruiti da stringa nel resto della
// piattaforma (es. `prisma/seed.ts`, `new Date("2024-01-01")`).
export function parseCsvDate(value: string, eventoId: string): Date {
  const trimmed = value.trim();
  const date = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new InvalidEventDateError(value, eventoId);
  }
  return date;
}

const DEFAULT_LEAD_TIME_DAYS = 90;
const FALLBACK_LEAD_TIME_DAYS = 7;

// `Event.datePublicationStart` non esiste in `table_eventi.csv`: il criterio
// scelto (documentato anche nel task) è "90 giorni prima di `dateEventStart`",
// con una clausola di sicurezza che riporta la pubblicazione a 7 giorni
// prima di `datePublicationEnd` se il criterio principale cadesse comunque dopo (o lo
// stesso giorno di) la chiusura iscrizioni — non osservato su nessuna delle
// 8 righe reali (verificato in `eventi.test.ts`), ma il CSV non garantisce
// che `datePublicationEnd` sia sempre a più di 90 giorni da `dateEventStart`.
export function derivePublicationDate(
  dateEventStart: Date,
  datePublicationEnd: Date
): Date {
  const candidate = new Date(dateEventStart);
  candidate.setUTCDate(candidate.getUTCDate() - DEFAULT_LEAD_TIME_DAYS);

  if (candidate.getTime() < datePublicationEnd.getTime()) {
    return candidate;
  }

  const fallback = new Date(datePublicationEnd);
  fallback.setUTCDate(fallback.getUTCDate() - FALLBACK_LEAD_TIME_DAYS);
  return fallback;
}
