import {
  isEvaluationErrorDetails,
  formatRequirementEvaluationMessage,
} from "@/lib/requirementErrorMessage";

export interface ApiErrorBody {
  error?: string;
  details?: unknown;
}

function isDowntimeErrorDetails(
  details: unknown
): details is { availableDowntimePoints: number } {
  return (
    !!details &&
    typeof details === "object" &&
    "availableDowntimePoints" in details
  );
}

function isXpErrorDetails(
  details: unknown
): details is { available: number; cost: number } {
  return (
    !!details &&
    typeof details === "object" &&
    "available" in details &&
    "cost" in details
  );
}

function isZodIssues(details: unknown): details is { message: string }[] {
  return Array.isArray(details) && details.every(d => "message" in d);
}

// Traduce il body di errore di `POST .../actions` (apprendimento talenti,
// `kind: "talent"` sotto `FT_PROGRESS`) in un
// messaggio utente, riconoscendo i formati di `details` che l'endpoint può
// restituire: saldo downtime insufficiente, saldo XP insufficiente,
// requisiti/conflitti non soddisfatti (T-039/T-044, vedi
// `requirementErrorMessage.ts`) o issue di validazione Zod.
export function mapAcquireErrorMessage(body: ApiErrorBody | null): string {
  const base = body?.error ?? "Errore durante l'apprendimento del talento";
  if (isDowntimeErrorDetails(body?.details)) {
    return `${base} (disponibile ${body.details.availableDowntimePoints}, richiesto 1 punto downtime)`;
  }
  if (isXpErrorDetails(body?.details)) {
    return `${base} (disponibili ${body.details.available} XP, richiesti ${body.details.cost} XP)`;
  }
  if (isEvaluationErrorDetails(body?.details)) {
    return formatRequirementEvaluationMessage(base, body.details);
  }
  if (isZodIssues(body?.details)) {
    const messages = body.details.map(issue => issue.message).join("; ");
    if (messages) return `${base}: ${messages}`;
  }
  return base;
}
