"use client";

import * as React from "react";
import { RequirementType } from "@prisma/client";
import { buildApiErrorMessage } from "./apiErrors";
import RequirementTargetSelect from "./RequirementTargetSelect";
import Btn from "@/components/_core/Btn";
import Text from "@/components/_core/Text";
import Skeleton from "@/components/_core/Skeleton";
import FieldText from "@/components/_core/FieldText";
import FieldSelect from "@/components/_core/FieldSelect";
import { useToast } from "@/components/_core/Toast";
import { ErrorCard } from "@/components/Feedback";
import Badge from "@/components/_core/Badge";
import { cn } from "@/lib/utils";
import { useQueryDataRequirements } from "@/lib/queries/dataRequirements";
import type { OutgoingDataRequirement } from "@/lib/validations/dataRequirement";
import { REQUIREMENT_TYPE_LABELS } from "@/lib/labels";

const REQUIREMENT_TYPE_ITEMS = (
  Object.keys(REQUIREMENT_TYPE_LABELS) as RequirementType[]
).map(type => ({ id: type, label: REQUIREMENT_TYPE_LABELS[type] }));

const GROUPABLE_TYPES: RequirementType[] = [
  RequirementType.requires,
  RequirementType.visibleWith,
];

export interface RulesSectionProps {
  campaignSlug: string;
  referenceData: { id: number; name: string };
}

// Sezione regole (`requires`/`blocks`/`visibleWith`/`grants`, T-016/T-027,
// esteso T-050, rinominata da "Requisiti" T-0xx — il nome non copriva più
// bene `visibleWith`/`grants`): solo per una voce già esistente (in
// creazione non c'è ancora un id su cui appendere archi) — condivisa dal
// form catalogo avanzato (`ModalEditDataCatalog`) e dal form talento
// dedicato (`ModalEditDataTalent`).
//
// Editing (T-0xx): cliccare una riga la carica nel form sotto (stesso
// Tipo/Categoria/Voce/Gruppo OR usato per aggiungerne una nuova) e il
// pulsante diventa "AGGIORNA" — niente endpoint PATCH dedicato, sotto è
// sempre un crea-poi-elimina (crea prima: se il nuovo arco è invalido, es.
// ciclo/duplicato, la riga originale resta intatta invece di sparire).
const RulesSection = ({ campaignSlug, referenceData }: RulesSectionProps) => {
  const { showToast } = useToast();
  const {
    data: graph,
    isLoading,
    error,
    refetch,
  } = useQueryDataRequirements(campaignSlug, referenceData.id);

  const [newType, setNewType] = React.useState<RequirementType>(
    RequirementType.requires
  );
  const [newTargetId, setNewTargetId] = React.useState("");
  const [newTargetCategoryLabel, setNewTargetCategoryLabel] =
    React.useState("");
  // Numero di gruppo OR facoltativo (solo per `requires`/`visibleWith`, vedi
  // `DataRequirement.groupId`): righe con lo stesso numero sulla stessa voce
  // diventano alternative — soddisfatta l'una, soddisfatte tutte. Stringa
  // vuota = riga individuale (comportamento storico, AND).
  const [newGroupId, setNewGroupId] = React.useState("");
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<number | null>(null);

  const requires = React.useMemo(() => graph?.requires ?? [], [graph]);
  const requiredBy = graph?.requiredBy ?? [];

  // Righe individuali (AND, comportamento storico) vs. OR-group: righe che
  // condividono lo stesso `groupId` sono alternative — soddisfatta una,
  // soddisfatte tutte (vedi `evaluateRequirements`, `characterData.service.ts`).
  const individualRequires = requires.filter(req => req.groupId == null);
  const groupedRequires = React.useMemo(() => {
    const groups = new Map<number, typeof requires>();
    for (const req of requires) {
      if (req.groupId == null) continue;
      const group = groups.get(req.groupId) ?? [];
      group.push(req);
      groups.set(req.groupId, group);
    }
    return Array.from(groups.entries());
  }, [requires]);

  const rowClassName = (id: number) =>
    cn(
      "flex items-center justify-between gap-2 rounded border px-3 py-2 cursor-pointer",
      editingId === id ? "border-primary bg-muted-bg" : "border-border"
    );

  const resetForm = () => {
    setEditingId(null);
    setNewType(RequirementType.requires);
    setNewTargetId("");
    setNewTargetCategoryLabel("");
    setNewGroupId("");
  };

  const startEdit = (req: OutgoingDataRequirement) => {
    setEditingId(req.id);
    setNewType(req.type);
    setNewTargetId(String(req.requiredDefinitionId));
    setNewTargetCategoryLabel(req.requiredDefinition.dataType.name);
    setNewGroupId(req.groupId != null ? String(req.groupId) : "");
  };

  const handleAdd = async () => {
    if (!newTargetId) {
      showToast({ variant: "error", message: "Seleziona una voce" });
      return;
    }
    setSaving(true);
    try {
      const trimmedGroupId = newGroupId.trim();
      const response = await fetch(
        `/api/campaigns/${campaignSlug}/reference-data/${referenceData.id}/requirements`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requiredDefinitionId: Number(newTargetId),
            type: newType,
            // Solo per `requires`/`visibleWith`: il backend rifiuta `groupId`
            // su `blocks`/`grants` (nessun significato dichiarato lì, vedi
            // `dataRequirement.ts`).
            ...(GROUPABLE_TYPES.includes(newType) && trimmedGroupId
              ? { groupId: Number(trimmedGroupId) }
              : {}),
          }),
        }
      );
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        showToast({
          variant: "error",
          message: buildApiErrorMessage(
            json,
            "Errore durante l'aggiunta della regola"
          ),
        });
        return;
      }
      showToast({ variant: "success", message: "Regola aggiunta" });
      resetForm();
      await refetch();
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: "Errore durante l'aggiunta della regola",
      });
    } finally {
      setSaving(false);
    }
  };

  // Crea-poi-elimina (nessun PATCH sul singolo `DataRequirement`): l'ordine
  // conta — se la creazione fallisce (ciclo, duplicato, ...) la riga
  // originale resta intatta invece di sparire prima che la nuova esista.
  const handleUpdate = async () => {
    if (!editingId || !newTargetId) {
      showToast({ variant: "error", message: "Seleziona una voce" });
      return;
    }
    const original = requires.find(req => req.id === editingId);
    const trimmedGroupId = newGroupId.trim();
    const nextGroupId =
      GROUPABLE_TYPES.includes(newType) && trimmedGroupId
        ? Number(trimmedGroupId)
        : undefined;
    const unchanged =
      original &&
      original.type === newType &&
      original.requiredDefinitionId === Number(newTargetId) &&
      (original.groupId ?? undefined) === nextGroupId;
    if (unchanged) {
      resetForm();
      return;
    }

    setSaving(true);
    try {
      const createResponse = await fetch(
        `/api/campaigns/${campaignSlug}/reference-data/${referenceData.id}/requirements`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requiredDefinitionId: Number(newTargetId),
            type: newType,
            ...(nextGroupId !== undefined ? { groupId: nextGroupId } : {}),
          }),
        }
      );
      if (!createResponse.ok) {
        const json = await createResponse.json().catch(() => null);
        showToast({
          variant: "error",
          message: buildApiErrorMessage(
            json,
            "Errore durante l'aggiornamento della regola"
          ),
        });
        return;
      }
      const deleteResponse = await fetch(
        `/api/campaigns/${campaignSlug}/reference-data/${referenceData.id}/requirements/${editingId}`,
        { method: "DELETE" }
      );
      if (!deleteResponse.ok) {
        // La nuova riga esiste già: non un errore bloccante, ma la vecchia
        // non è stata ripulita (raro — richiede il refetch sotto per
        // accorgersene, invece di far sparire l'avviso subito).
        showToast({
          variant: "error",
          message:
            "Regola aggiornata, ma la versione precedente non è stata rimossa: ricontrolla l'elenco",
        });
      } else {
        showToast({ variant: "success", message: "Regola aggiornata" });
      }
      resetForm();
      await refetch();
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: "Errore durante l'aggiornamento della regola",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (requirementId: number) => {
    setRemovingId(requirementId);
    try {
      const response = await fetch(
        `/api/campaigns/${campaignSlug}/reference-data/${referenceData.id}/requirements/${requirementId}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        showToast({
          variant: "error",
          message: buildApiErrorMessage(
            json,
            "Errore durante la rimozione della regola"
          ),
        });
        return;
      }
      showToast({ variant: "success", message: "Regola rimossa" });
      if (editingId === requirementId) resetForm();
      await refetch();
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: "Errore durante la rimozione della regola",
      });
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Text weight="bolder" className="text-muted-fg" children="Regole" />

      {isLoading ? (
        <Skeleton className="h-[16px] w-full" />
      ) : error ? (
        <ErrorCard onRetry={() => refetch()} />
      ) : (
        <>
          {requires.length === 0 ? (
            <Text
              className="text-muted-fg"
              children="Nessuna regola impostata su questa voce."
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              {individualRequires.map(req => (
                <div
                  key={req.id}
                  className={rowClassName(req.id)}
                  onClick={() => startEdit(req)}
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      label={REQUIREMENT_TYPE_LABELS[req.type]}
                      color="var(--fail)"
                      disabled={req.type !== "blocks"}
                    />
                    <Text
                      size={0}
                      className="text-muted-fg"
                      children={req.requiredDefinition.dataType.name}
                    />
                    <Text children={req.requiredDefinition.name} />
                  </div>
                  <Btn
                    icon="close"
                    tooltip="Rimuovi regola"
                    small
                    disabled={removingId === req.id}
                    onClick={event => {
                      event.stopPropagation();
                      handleRemove(req.id);
                    }}
                  />
                </div>
              ))}

              {groupedRequires.map(([groupId, alternatives]) => (
                <div
                  key={`group-${groupId}`}
                  className="flex flex-col gap-1 rounded border border-dashed border-border px-3 py-2"
                >
                  <Text
                    size={0}
                    className="text-muted-fg"
                    children={`Richiede almeno una tra (gruppo ${groupId}):`}
                  />
                  {alternatives.map((req, index) => (
                    <React.Fragment key={req.id}>
                      {index > 0 && (
                        <Text
                          size={0}
                          weight="bolder"
                          className="text-muted-fg"
                          children="oppure"
                        />
                      )}
                      <div
                        className={rowClassName(req.id)}
                        onClick={() => startEdit(req)}
                      >
                        <div className="flex items-center gap-2">
                          <Text
                            size={0}
                            className="text-muted-fg"
                            children={req.requiredDefinition.dataType.name}
                          />
                          <Text children={req.requiredDefinition.name} />
                        </div>
                        <Btn
                          icon="close"
                          tooltip="Rimuovi regola"
                          small
                          disabled={removingId === req.id}
                          onClick={event => {
                            event.stopPropagation();
                            handleRemove(req.id);
                          }}
                        />
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              ))}
            </div>
          )}

          {requiredBy.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Text
                size={0}
                className="text-muted-fg"
                children="Voci che dipendono da questa (sola lettura, rimuovibili dalla loro pagina):"
              />
              <div className="flex flex-wrap gap-1.5">
                {requiredBy.map(req => (
                  <Badge
                    key={req.id}
                    icon={req.type === "blocks" ? "block" : "link"}
                    label={`${req.definition.dataType.name} · ${req.definition.name}`}
                    disabled
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <FieldSelect
            showAllItems
            className="w-[140px]"
            label="Tipo"
            value={newType}
            items={REQUIREMENT_TYPE_ITEMS}
            onChange={value => {
              const type = value as RequirementType;
              setNewType(type);
              if (!GROUPABLE_TYPES.includes(type)) {
                setNewGroupId("");
              }
            }}
          />
          <RequirementTargetSelect
            key={editingId ?? "new"}
            campaignSlug={campaignSlug}
            type={newType}
            excludeEntryId={referenceData.id}
            value={newTargetId}
            initialCategoryLabel={
              editingId != null ? newTargetCategoryLabel : undefined
            }
            onChange={(value, _label, categoryLabel) => {
              setNewTargetId(value);
              setNewTargetCategoryLabel(categoryLabel);
            }}
          />
          {GROUPABLE_TYPES.includes(newType) && (
            <FieldText
              className="w-[110px]"
              label="Gruppo OR"
              placeholder="opzionale"
              value={newGroupId}
              onChange={value =>
                // Oltre ai non-numerici, rimuove anche gli zeri iniziali
                // (review round 1): il backend rifiuta `groupId` non positivo
                // (`0` da solo diventerebbe `Number("0") === 0`), "007" resta
                // comunque valido come `7` una volta ripulito.
                setNewGroupId(value.replace(/[^0-9]/g, "").replace(/^0+/, ""))
              }
            />
          )}
        </div>
        <div className="flex gap-2">
          {editingId != null && (
            <Btn label="ANNULLA" disabled={saving} onClick={resetForm} />
          )}
          <Btn
            label={editingId != null ? "AGGIORNA" : "AGGIUNGI"}
            disabled={saving || !newTargetId}
            onClick={editingId != null ? handleUpdate : handleAdd}
          />
        </div>
      </div>
    </div>
  );
};

export default RulesSection;
