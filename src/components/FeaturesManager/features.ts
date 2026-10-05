// Helper puri per la pagina admin/features (T-031): costruiscono/leggono un
// form dinamico a partire da `FeatureType.featureSchema`, che a DB è lo
// snapshot JSON Schema (`z.toJSONSchema`, seed) dello stesso Zod schema che
// l'API di configurazione (T-019, `/api/campaigns/[campaignSlug]/features`)
// usa per validare davvero `featureData` — qui è solo introspezione per
// decidere quali campi mostrare, MAI la fonte di verità della validazione:
// il round-trip col 422 del server resta l'unico enforcement reale (vedi
// `## Scope` del task file).
//
// Solo gli schemi "oggetto piatto" (proprietà stringa/numero/intero/
// booleano, nessun oggetto annidato/array/enum) sono renderizzati con un
// form guidato; qualunque altra forma (compreso un array `properties`
// mancante di tipo non riconosciuto) ricade su un editor JSON grezzo nel
// componente chiamante (`isSimpleObjectSchema` restituisce `false`).

export interface FeaturePropertySchema {
  type?: string;
  title?: string;
  description?: string;
  minimum?: number;
  maximum?: number;
}

export interface FeatureObjectSchema {
  type?: string;
  properties?: Record<string, FeaturePropertySchema>;
  required?: string[];
}

const SUPPORTED_LEAF_TYPES = new Set([
  "string",
  "number",
  "integer",
  "boolean",
]);

function isFeaturePropertySchema(
  value: unknown
): value is FeaturePropertySchema {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as FeaturePropertySchema).type === "string" &&
    SUPPORTED_LEAF_TYPES.has((value as FeaturePropertySchema).type as string)
  );
}

// Un oggetto JSON Schema è "semplice" se è di tipo `object` e ogni proprietà
// dichiarata è una foglia di tipo primitivo supportato — incluso il caso
// `properties` assente/vuoto (nessuna configurazione richiesta, es.
// `downtimeWork`).
export function isSimpleObjectSchema(
  schema: unknown
): schema is FeatureObjectSchema {
  if (!schema || typeof schema !== "object") return false;
  const candidate = schema as FeatureObjectSchema;
  if (candidate.type !== "object") return false;
  const properties = candidate.properties;
  if (properties === undefined) return true;
  if (typeof properties !== "object" || properties === null) return false;
  return Object.values(properties).every(isFeaturePropertySchema);
}

export type FeatureFormValues = Record<string, string | boolean>;

// Valori iniziali del form: da `featureData` esistente (edit) o vuoti
// (attivazione). I numeri sono tenuti come stringa nello state del form
// (coerente con `FieldText`, che lavora solo su stringhe) e riconvertiti in
// `buildFeatureDataPayload`.
export function buildInitialFormValues(
  schema: FeatureObjectSchema,
  existingData: unknown
): FeatureFormValues {
  const data =
    existingData && typeof existingData === "object"
      ? (existingData as Record<string, unknown>)
      : {};
  const values: FeatureFormValues = {};
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    const current = data[key];
    if (prop.type === "boolean") {
      values[key] = typeof current === "boolean" ? current : false;
    } else {
      values[key] =
        current === undefined || current === null ? "" : String(current);
    }
  }
  return values;
}

// Converte i valori del form nel `featureData` da inviare all'API. Un campo
// numerico lasciato vuoto è omesso (non `NaN`/`0`): lascia che sia il 422
// del server a dire "obbligatorio", invece di inventare un default qui.
export function buildFeatureDataPayload(
  schema: FeatureObjectSchema,
  values: FeatureFormValues
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    const raw = values[key];
    if (prop.type === "boolean") {
      payload[key] = !!raw;
    } else if (prop.type === "number" || prop.type === "integer") {
      const trimmed = typeof raw === "string" ? raw.trim() : "";
      if (trimmed !== "") payload[key] = Number(trimmed);
    } else {
      payload[key] = typeof raw === "string" ? raw : "";
    }
  }
  return payload;
}

export function stringifyFeatureData(data: unknown): string {
  return JSON.stringify(data ?? {}, null, 2);
}

export function parseFeatureDataJson(
  text: string
): { ok: true; data: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return {
      ok: false,
      error: "JSON non valido: correggi la sintassi prima di salvare.",
    };
  }
}

export interface FeatureApiErrorBody {
  error?: string;
  details?: unknown;
}

// Forma di `error.flatten()` (Zod) restituita dal 422 dell'API di
// configurazione (T-019, `createFeatureSchema`/`updateFeatureSchema`, e — a
// monte — il `featureSchema` dell'handler): usata per mostrare sia il
// messaggio generale sia gli errori per campo, senza reimplementare la
// validazione lato client. Condivisa da `ModalFeature.tsx` e
// `ModalFeatureMissive.tsx` (entrambe POSTano/PATCHano sugli stessi endpoint
// generici di configurazione feature).
export function isZodFlatten(details: unknown): details is {
  formErrors: string[];
  fieldErrors: Record<string, string[]>;
} {
  return (
    !!details &&
    typeof details === "object" &&
    "fieldErrors" in details &&
    typeof (details as { fieldErrors: unknown }).fieldErrors === "object"
  );
}

export function mapFeatureErrorMessage(
  body: FeatureApiErrorBody | null
): string {
  const base = body?.error ?? "Errore durante il salvataggio della feature";
  if (isZodFlatten(body?.details)) {
    const fieldMessages = Object.entries(body.details.fieldErrors)
      .filter(([, messages]) => messages.length > 0)
      .map(([field, messages]) => `${field}: ${messages.join(", ")}`);
    if (fieldMessages.length > 0) {
      return `${base} (${fieldMessages.join("; ")})`;
    }
  }
  return base;
}
