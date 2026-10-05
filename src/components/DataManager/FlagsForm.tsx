"use client";

import * as React from "react";
import { z } from "zod";
import { DataTypeKind } from "@prisma/client";
import BtnCheckbox from "@/components/_core/BtnCheckbox";
import FieldText from "@/components/_core/FieldText";
import {
  getFlagsSchemaForKind,
  FLAG_FIELD_COMPANION_OF,
} from "@/lib/validations/referenceDataFlags";
import { REFERENCE_DATA_FLAG_LABELS as FLAG_LABELS } from "@/lib/labels";

// Form `flags` dinamico per-`kind` (T-016/T-030): fonte di verità
// `referenceDataFlags.ts`, condiviso dalla gestione avanzata di catalogo e
// pagine.

function flagsShape(kind: DataTypeKind): Record<string, z.ZodTypeAny> {
  const schema = getFlagsSchemaForKind(kind);
  return schema instanceof z.ZodObject
    ? (schema.shape as Record<string, z.ZodTypeAny>)
    : {};
}

// Un campo `flags` può essere `.optional()` (es. `category`): il wrapper
// `ZodOptional` va tolto prima di ispezionare il tipo sottostante
// (`instanceof z.ZodBoolean`/`ZodString`), altrimenti nessun branch
// combacerebbe e il campo cadrebbe erroneamente nel default numerico.
function isOptionalFlagField(schema: z.ZodTypeAny): boolean {
  return schema instanceof z.ZodOptional;
}

function unwrapFlagField(schema: z.ZodTypeAny): z.ZodTypeAny {
  return schema instanceof z.ZodOptional
    ? (schema.unwrap() as z.ZodTypeAny)
    : schema;
}

export function buildDefaultFlags(kind: DataTypeKind): Record<string, unknown> {
  const shape = flagsShape(kind);
  const defaults: Record<string, unknown> = {};
  for (const [key, fieldSchema] of Object.entries(shape)) {
    const inner = unwrapFlagField(fieldSchema);
    if (inner instanceof z.ZodBoolean) {
      defaults[key] = false;
    } else if (inner instanceof z.ZodString) {
      // Un campo stringa opzionale (unico caso oggi: `category`) parte
      // "non impostato" (`undefined`, mai inviato) invece di una stringa
      // vuota: coerente con l'essere davvero facoltativo.
      defaults[key] = isOptionalFlagField(fieldSchema) ? undefined : "";
    } else {
      // Un campo numerico opzionale (es. `maxRepetitions`) parte "non
      // impostato" invece di 0, che per un `min(2)` sarebbe già invalido.
      defaults[key] = isOptionalFlagField(fieldSchema) ? undefined : 0;
    }
  }
  return defaults;
}

// Un valore `flags` esistente può avere campi mancanti (voce creata prima
// dell'aggiunta di un flag al `kind`, o `flags` nullo): i default colmano i
// buchi, il valore persistito vince quando presente.
export function toFlagsFormValue(
  kind: DataTypeKind,
  raw: unknown
): Record<string, unknown> {
  const defaults = buildDefaultFlags(kind);
  if (raw && typeof raw === "object") {
    return { ...defaults, ...(raw as Record<string, unknown>) };
  }
  return defaults;
}

// Messaggio IT guidato dai campi falliti (le chiavi, non il testo del
// messaggio Zod di default, che non è localizzato).
export function formatFlagsValidationError(error: z.ZodError): string {
  const fields = Object.keys(error.flatten().fieldErrors).filter(
    field => (error.flatten().fieldErrors[field]?.length ?? 0) > 0
  );
  if (fields.length === 0) {
    return "Gli attributi non sono validi per questa categoria";
  }
  const labels = fields.map(field => FLAG_LABELS[field] ?? field);
  return `Controlla questi attributi: ${labels.join(", ")}`;
}

interface FlagsFormProps {
  kind: DataTypeKind;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  // Solo per `kind: talent` (vedi `EntryFormAdvancedConfig`): quando la
  // rispettiva Feature di campagna non è attiva, la checkbox del flag non
  // ha senso da mostrare in creazione/modifica — il valore persistito, se
  // già `true` da quando la feature era attiva, resta intatto (il campo non
  // sparisce dallo schema, solo dalla UI).
  missiveActive?: boolean;
  downtimeActive?: boolean;
}

function renderValueField(
  key: string,
  fieldSchema: z.ZodTypeAny,
  value: Record<string, unknown>,
  onChange: (next: Record<string, unknown>) => void,
  className?: string
) {
  const innerSchema = unwrapFlagField(fieldSchema);
  const optional = isOptionalFlagField(fieldSchema);
  const raw = value[key];
  if (innerSchema instanceof z.ZodString) {
    return (
      <FieldText
        key={key}
        className={className}
        label={FLAG_LABELS[key] ?? key}
        labelMandatory={!optional}
        value={raw === undefined || raw === null ? "" : String(raw)}
        onChange={next =>
          onChange({ ...value, [key]: next.trim() === "" ? undefined : next })
        }
      />
    );
  }
  return (
    <FieldText
      key={key}
      className={className}
      label={FLAG_LABELS[key] ?? key}
      labelMandatory={!optional}
      inputType="number"
      value={raw === undefined || raw === null ? "" : String(raw)}
      onChange={next =>
        onChange({
          ...value,
          [key]: next.trim() === "" ? undefined : Number(next),
        })
      }
    />
  );
}

const FlagsForm = ({
  kind,
  value,
  onChange,
  missiveActive,
  downtimeActive,
}: FlagsFormProps) => {
  const shape = flagsShape(kind);
  const keys = Object.keys(shape).filter(key => {
    if (key === "isMissivePointBonus") return !!missiveActive;
    if (key === "isDowntimePointBonus") return !!downtimeActive;
    return true;
  });
  if (keys.length === 0) return null;

  // Un campo "compagno" (`FLAG_FIELD_COMPANION_OF`, es. `maxRepetitions` di
  // `repeatable`) non ha una riga propria: si renderizza accanto al
  // genitore, solo quando questo è attivo — nessun nome di flag hardcoded
  // qui, la relazione è dichiarata una volta sola vicino allo schema.
  const companionByParent = new Map<string, string>();
  for (const key of keys) {
    const parent = FLAG_FIELD_COMPANION_OF[key];
    if (parent && parent in shape) companionByParent.set(parent, key);
  }
  const companionKeys = new Set(companionByParent.values());

  const checkboxKeys = keys.filter(
    key =>
      !companionKeys.has(key) &&
      unwrapFlagField(shape[key]) instanceof z.ZodBoolean
  );
  const valueKeys = keys.filter(
    key =>
      !companionKeys.has(key) &&
      !(unwrapFlagField(shape[key]) instanceof z.ZodBoolean)
  );

  return (
    <div className="flex flex-col gap-3">
      {valueKeys.length > 0 && (
        <div className="flex flex-col gap-3">
          {valueKeys.map(key =>
            renderValueField(key, shape[key], value, onChange)
          )}
        </div>
      )}
      {checkboxKeys.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {checkboxKeys.map(key => {
            const checkbox = (
              <BtnCheckbox
                key={key}
                label={FLAG_LABELS[key] ?? key}
                selected={!!value[key]}
                onClick={checked => onChange({ ...value, [key]: checked })}
              />
            );
            const companionKey = companionByParent.get(key);
            if (!companionKey || !value[key]) return checkbox;
            return (
              <div key={key} className="flex flex-wrap items-center gap-2">
                {checkbox}
                {renderValueField(
                  companionKey,
                  shape[companionKey],
                  value,
                  onChange,
                  "w-[170px]"
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FlagsForm;
