"use client";

import * as React from "react";
import { DataTypeKind, DataVisibility, RequirementType } from "@prisma/client";
import type { ContentEntry } from "./types";
import {
  buildDefaultFlags,
  toFlagsFormValue,
  formatFlagsValidationError,
} from "./FlagsForm";
import { buildApiErrorMessage } from "./apiErrors";
import { useToast } from "@/components/_core/Toast";
import { getFlagsSchemaForKind } from "@/lib/validations/referenceDataFlags";

// Requisito "in bozza" (T-0xx, creazione atomica): non ha ancora un id
// server (`key` è solo per la lista React lato client) — inviato al POST di
// creazione così il talento nasce già con i suoi requisiti invece di doverli
// aggiungere in un secondo momento con l'endpoint dedicato a voce esistente.
export interface DraftRequirement {
  key: string;
  requiredDefinitionId: number;
  requiredDefinitionName: string;
  // Solo per l'etichetta in lista (`DraftRulesEditor`, come la
  // Categoria mostrata da `RulesSection` per una voce già esistente):
  // non inviata al POST di creazione, che manda solo id/type/groupId.
  requiredDefinitionCategoryName: string;
  type: RequirementType;
  groupId?: number;
}

interface FormState {
  name: string;
  description: string;
  visibility: DataVisibility;
  flags: Record<string, unknown>;
  // Significativi solo in creazione (`!editing`): una voce già esistente
  // gestisce i suoi requisiti dal vivo via `RulesSection`, non da qui.
  requirements: DraftRequirement[];
}

const emptyFormState = (kind?: DataTypeKind): FormState => ({
  name: "",
  description: "",
  visibility: DataVisibility.visible,
  flags: kind ? buildDefaultFlags(kind) : {},
  requirements: [],
});

// Config opzionale di gestione avanzata (T-030 admin): quando presente, il
// form valida/invia anche `flags` (dinamici per-`kind`), contro l'endpoint
// completo `reference-data` invece del sottoinsieme semplificato
// `reference-data/entry` (che li rifiuta, `.strict()`). La condizione di
// visibilità non è più un campo diretto della voce (T-050): vive come arco
// `visibleWith` nello stesso editor requisiti (`RulesSection`/
// `DraftRulesEditor`) già presente per `requires`/`blocks`/`grants`.
export interface EntryFormAdvancedOptions {
  kind: DataTypeKind;
}

// Variante "UI" della config avanzata: oltre a `kind` (per `useEntryForm`) —
// usata da `ModalEditDataCatalog`/`ModalEditDataPage`/`ManagerDataCatalogs`/
// `ManagerDataPages`/`ButtonCreateDataCatalog`/`ButtonCreateDataPage`, tutti
// condivisi tra la pagina dati (assente) e la gestione admin (T-030,
// valorizzata).
export type EntryFormAdvancedConfig = EntryFormAdvancedOptions & {
  // Solo per `kind: talent` (T-0xx, flag "Aggiungi punto Missiva/Downtime"):
  // se la rispettiva Feature di campagna non è attiva, `FlagsForm` nasconde
  // la checkbox. `undefined`/assente altrove (nessun altro `kind` la legge).
  missiveActive?: boolean;
  downtimeActive?: boolean;
};

interface UseEntryFormOptions {
  open: boolean;
  editing: ContentEntry | null;
  campaignSlug: string;
  dataTypeId: number;
  onClose: () => void;
  onSaved: () => void;
  advanced?: EntryFormAdvancedOptions;
}

// Stato/flusso di creazione-modifica condiviso da `ModalEditDataCatalog` e
// `ModalEditDataPage`: cambia solo il campo usato per il contenuto (FieldText
// vs FieldRichText), non la logica di submit verso `reference-data`.
export function useEntryForm({
  open,
  editing,
  campaignSlug,
  dataTypeId,
  onClose,
  onSaved,
  advanced,
}: UseEntryFormOptions) {
  const { showToast } = useToast();
  const [form, setForm] = React.useState<FormState>(() =>
    emptyFormState(advanced?.kind)
  );
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? {
            name: editing.name,
            description: editing.description ?? "",
            visibility: editing.visibility,
            flags: advanced
              ? toFlagsFormValue(advanced.kind, editing.flags)
              : {},
            requirements: [],
          }
        : emptyFormState(advanced?.kind)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, advanced?.kind]);

  const patch = (next: Partial<FormState>) =>
    setForm(prev => ({ ...prev, ...next }));

  const nameValid = form.name.trim().length > 0;

  const handleSubmit = async () => {
    if (!nameValid) return;

    // Validati contro lo stesso schema Zod per-`kind` usato dall'API
    // (`referenceDataFlags.ts`, T-016) *prima* dell'invio: un form non
    // valido non arriva mai in rete.
    let flags: Record<string, unknown> | undefined;
    if (advanced) {
      const flagsResult = getFlagsSchemaForKind(advanced.kind).safeParse(
        form.flags
      );
      if (!flagsResult.success) {
        showToast({
          variant: "error",
          message: formatFlagsValidationError(flagsResult.error),
        });
        return;
      }
      flags = flagsResult.data as Record<string, unknown>;
    }

    setSubmitting(true);
    try {
      const basePayload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        visibility: form.visibility,
      };
      const payload = advanced ? { ...basePayload, flags } : basePayload;

      const baseUrl = `/api/campaigns/${campaignSlug}/reference-data`;
      const response = editing
        ? await fetch(
            advanced
              ? `${baseUrl}/${editing.id}`
              : `${baseUrl}/${editing.id}/entry`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            }
          )
        : await fetch(advanced ? baseUrl : `${baseUrl}/entry`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...payload,
              dataTypeId,
              // Requisiti in bozza (T-0xx, creazione atomica): solo in
              // creazione avanzata, solo se ce ne sono — l'endpoint semplice
              // (`/entry`) non li accetta.
              ...(advanced && form.requirements.length > 0
                ? {
                    requirements: form.requirements.map(
                      ({ requiredDefinitionId, type, groupId }) => ({
                        requiredDefinitionId,
                        type,
                        groupId,
                      })
                    ),
                  }
                : {}),
            }),
          });

      if (!response.ok) {
        const json = await response.json().catch(() => null);
        showToast({
          variant: "error",
          message: buildApiErrorMessage(
            json,
            editing
              ? "Errore durante l'aggiornamento"
              : "Errore durante la creazione"
          ),
        });
        return;
      }

      showToast({
        variant: "success",
        message: editing ? "Voce aggiornata" : "Voce creata",
      });
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: editing
          ? "Errore durante l'aggiornamento"
          : "Errore durante la creazione",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return { form, patch, submitting, nameValid, handleSubmit };
}
