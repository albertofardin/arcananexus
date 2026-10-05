import { REFERENCE_DATA_FLAG_LABELS as FLAG_LABELS } from "@/lib/labels";

// Messaggio d'errore leggibile per le risposte API non-2xx: antepone sempre
// il messaggio IT già restituito dalla route (`json.error`), poi arricchisce
// con i nomi dei campi (422 flags, T-016) o delle voci dipendenti (409 delete
// con dipendenti, T-027) quando presenti — mai il testo grezzo del `details`
// (i messaggi Zod di default non sono localizzati).
export function buildApiErrorMessage(
  json: { error?: string; details?: unknown } | null,
  fallback: string
): string {
  if (!json?.error) return fallback;

  const details = json.details as
    | {
        fieldErrors?: Record<string, string[]>;
        dependents?: { id: number; name: string }[];
      }
    | undefined;

  if (details?.fieldErrors) {
    const fields = Object.keys(details.fieldErrors).filter(
      field => (details.fieldErrors?.[field]?.length ?? 0) > 0
    );
    if (fields.length > 0) {
      const labels = fields.map(field => FLAG_LABELS[field] ?? field);
      return `${json.error}: ${labels.join(", ")}`;
    }
  }

  if (details?.dependents && details.dependents.length > 0) {
    return `${json.error}: ${details.dependents.map(d => d.name).join(", ")}`;
  }

  return json.error;
}
