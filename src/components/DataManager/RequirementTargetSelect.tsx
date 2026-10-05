"use client";

import * as React from "react";
import { DataTypeKind, type RequirementType } from "@prisma/client";
import FieldSelect from "@/components/_core/FieldSelect";
import { useQueryCampaignDataTypes } from "@/lib/queries/dataTypes";
import { useQueryCampaignReferenceData } from "@/lib/queries/referenceData";

// Solo i `DataType` di kind `talent`/`assignable` sono categorie di
// bersaglio valide per un requisito `requires`/`blocks`: `origins`
// (cardinalità fissa "single", una sola per PG) e `generic` (mai assegnata a
// un personaggio) non sono pensate come prerequisiti/blocchi acquisibili. Un
// arco `visibleWith`/`grants` ammette invece anche `origins` come bersaglio
// (es. "Razza": una voce visibile solo a chi è Elfo, o una razza che aggiunge
// automaticamente un talento).
const REQUIREMENT_TARGET_KINDS: DataTypeKind[] = [
  DataTypeKind.talent,
  DataTypeKind.assignable,
];
const CONDITIONAL_TARGET_KINDS: DataTypeKind[] = [
  ...REQUIREMENT_TARGET_KINDS,
  DataTypeKind.origins,
];

export interface RequirementTargetSelectProps {
  campaignSlug: string;
  type: RequirementType;
  // Esclude questa voce dalle Voci selezionabili (una voce non può
  // richiedere/bloccare se stessa) — solo per una voce già esistente
  // (`RulesSection`), assente in creazione (`DraftRulesEditor`).
  excludeEntryId?: number;
  value: string; // id della `ReferenceData` selezionata, "" = nessuna
  onChange: (value: string, label: string, categoryLabel: string) => void;
  // Precompila la Categoria all'apertura in editing di una riga esistente
  // (T-0xx, click-to-edit): risolta per NOME contro l'elenco `DataType`
  // appena disponibile, non per id (il chiamante — `RulesSection`/
  // `DraftRulesEditor` — ha solo il nome della Categoria della riga, non il
  // suo `dataTypeId`). Il chiamante deve rimontare il componente (prop
  // `key`) quando la riga in editing cambia, altrimenti il seed iniziale
  // (una tantum, vedi `seededRef` sotto) non si ripete per la riga nuova.
  initialCategoryLabel?: string;
}

// Selettore a due passi del bersaglio di un requisito: prima la Categoria
// (`DataType`, es. "Razza"), che filtra il secondo select sulle sole Voci di
// quella categoria (es. "Elfo") — al posto di un unico select con l'intero
// catalogo della campagna, poco leggibile quando le voci sono molte.
// Condiviso da `RulesSection`/`DraftRulesEditor`. Le categorie
// selezionabili dipendono da `type` (vedi `CONDITIONAL_TARGET_KINDS` sopra).
const RequirementTargetSelect = ({
  campaignSlug,
  type,
  excludeEntryId,
  value,
  onChange,
  initialCategoryLabel,
}: RequirementTargetSelectProps) => {
  const { data: dataTypes } = useQueryCampaignDataTypes(campaignSlug);
  const [dataTypeId, setDataTypeId] = React.useState("");
  // Seed una tantum (mai ripetuto se `dataTypes` si aggiorna dopo, es.
  // refetch in background): altrimenti sovrascriverebbe una Categoria che
  // l'admin ha nel frattempo cambiato a mano.
  const seededRef = React.useRef(false);
  React.useEffect(() => {
    if (seededRef.current || !initialCategoryLabel || !dataTypes) return;
    const match = dataTypes.find(dt => dt.name === initialCategoryLabel);
    if (match) {
      seededRef.current = true;
      setDataTypeId(String(match.id));
    }
  }, [initialCategoryLabel, dataTypes]);

  const allowedKinds =
    type === "visibleWith" || type === "grants"
      ? CONDITIONAL_TARGET_KINDS
      : REQUIREMENT_TARGET_KINDS;

  const dataTypeOptions = React.useMemo(
    () =>
      (dataTypes ?? [])
        .filter(dataType => allowedKinds.includes(dataType.kind))
        .map(dataType => ({
          id: String(dataType.id),
          label: dataType.name,
        })),
    [dataTypes, allowedKinds]
  );

  const { data: entries } = useQueryCampaignReferenceData(
    campaignSlug,
    dataTypeId ? Number(dataTypeId) : undefined,
    { enabled: !!dataTypeId }
  );

  const entryOptions = React.useMemo(
    () =>
      (entries ?? [])
        .filter(entry => entry.id !== excludeEntryId)
        .map(entry => ({ id: String(entry.id), label: entry.name })),
    [entries, excludeEntryId]
  );

  return (
    <>
      <FieldSelect
        showAllItems
        className="w-[160px]"
        label="Categoria"
        placeholder="Seleziona..."
        value={dataTypeId}
        items={dataTypeOptions}
        onChange={next => {
          setDataTypeId(String(next));
          // Cambiare categoria invalida la Voce già scelta nell'altra.
          onChange("", "", "");
        }}
      />
      <FieldSelect
        showAllItems
        className="min-w-[200px] flex-1"
        label="Voce"
        placeholder={
          dataTypeId ? "Seleziona una voce..." : "Scegli prima una categoria"
        }
        disabled={!dataTypeId}
        value={value}
        items={entryOptions}
        onChange={next => {
          const target = entryOptions.find(
            option => option.id === String(next)
          );
          const category = dataTypeOptions.find(
            option => option.id === dataTypeId
          );
          onChange(String(next), target?.label ?? "", category?.label ?? "");
        }}
      />
    </>
  );
};

export default RequirementTargetSelect;
