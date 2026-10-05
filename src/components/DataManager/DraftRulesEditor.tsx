"use client";

import * as React from "react";
import { RequirementType } from "@prisma/client";
import type { DraftRequirement } from "./useEntryForm";
import RequirementTargetSelect from "./RequirementTargetSelect";
import { cn } from "@/lib/utils";
import Btn from "@/components/_core/Btn";
import Text from "@/components/_core/Text";
import FieldText from "@/components/_core/FieldText";
import FieldSelect from "@/components/_core/FieldSelect";
import Badge from "@/components/_core/Badge";
import { useToast } from "@/components/_core/Toast";
import { REQUIREMENT_TYPE_LABELS } from "@/lib/labels";

const REQUIREMENT_TYPE_ITEMS = (
  Object.keys(REQUIREMENT_TYPE_LABELS) as RequirementType[]
).map(type => ({ id: type, label: REQUIREMENT_TYPE_LABELS[type] }));

const GROUPABLE_TYPES: RequirementType[] = [
  RequirementType.requires,
  RequirementType.visibleWith,
];

export interface DraftRulesEditorProps {
  campaignSlug: string;
  value: DraftRequirement[];
  onChange: (next: DraftRequirement[]) => void;
}

// Variante "in bozza" di `RulesSection` (T-0xx, creazione atomica):
// stato locale invece di chiamate live add/remove, perché in creazione la
// voce non ha ancora un id su cui appendere gli archi — il genitore
// (`ModalEditDataTalent`/`ModalEditDataCatalog`/`useEntryForm`) li invia
// tutti insieme al POST di creazione, che li crea in transazione con la voce.
//
// Editing (T-0xx): cliccare una riga la carica nel form sotto e il pulsante
// diventa "AGGIORNA" — qui è solo manipolazione dell'array locale, nessuna
// chiamata di rete (a differenza di `RulesSection`, che deve creare-poi-
// eliminare contro l'API).
const DraftRulesEditor = ({
  campaignSlug,
  value,
  onChange,
}: DraftRulesEditorProps) => {
  const { showToast } = useToast();

  const [newType, setNewType] = React.useState<RequirementType>(
    RequirementType.requires
  );
  const [newTargetId, setNewTargetId] = React.useState("");
  const [newTargetLabel, setNewTargetLabel] = React.useState("");
  const [newTargetCategoryLabel, setNewTargetCategoryLabel] =
    React.useState("");
  const [newGroupId, setNewGroupId] = React.useState("");
  const [editingKey, setEditingKey] = React.useState<string | null>(null);

  const resetForm = () => {
    setEditingKey(null);
    setNewType(RequirementType.requires);
    setNewTargetId("");
    setNewTargetLabel("");
    setNewTargetCategoryLabel("");
    setNewGroupId("");
  };

  const startEdit = (req: DraftRequirement) => {
    setEditingKey(req.key);
    setNewType(req.type);
    setNewTargetId(String(req.requiredDefinitionId));
    setNewTargetLabel(req.requiredDefinitionName);
    setNewTargetCategoryLabel(req.requiredDefinitionCategoryName);
    setNewGroupId(req.groupId != null ? String(req.groupId) : "");
  };

  const handleAdd = () => {
    if (!newTargetId) {
      showToast({ variant: "error", message: "Seleziona una voce" });
      return;
    }
    const requiredDefinitionId = Number(newTargetId);
    const duplicate = value.some(
      req =>
        req.requiredDefinitionId === requiredDefinitionId &&
        req.type === newType
    );
    if (duplicate) {
      showToast({ variant: "error", message: "Regola già aggiunta" });
      return;
    }
    const trimmedGroupId = newGroupId.trim();
    onChange([
      ...value,
      {
        key: `${requiredDefinitionId}-${newType}-${Date.now()}`,
        requiredDefinitionId,
        requiredDefinitionName: newTargetLabel,
        requiredDefinitionCategoryName: newTargetCategoryLabel,
        type: newType,
        groupId:
          GROUPABLE_TYPES.includes(newType) && trimmedGroupId
            ? Number(trimmedGroupId)
            : undefined,
      },
    ]);
    resetForm();
  };

  const handleUpdate = () => {
    if (!editingKey || !newTargetId) {
      showToast({ variant: "error", message: "Seleziona una voce" });
      return;
    }
    const requiredDefinitionId = Number(newTargetId);
    const duplicate = value.some(
      req =>
        req.key !== editingKey &&
        req.requiredDefinitionId === requiredDefinitionId &&
        req.type === newType
    );
    if (duplicate) {
      showToast({ variant: "error", message: "Regola già aggiunta" });
      return;
    }
    const trimmedGroupId = newGroupId.trim();
    onChange(
      value.map(req =>
        req.key === editingKey
          ? {
              ...req,
              requiredDefinitionId,
              requiredDefinitionName: newTargetLabel,
              requiredDefinitionCategoryName: newTargetCategoryLabel,
              type: newType,
              groupId:
                GROUPABLE_TYPES.includes(newType) && trimmedGroupId
                  ? Number(trimmedGroupId)
                  : undefined,
            }
          : req
      )
    );
    resetForm();
  };

  const handleRemove = (key: string) => {
    onChange(value.filter(req => req.key !== key));
    if (editingKey === key) resetForm();
  };

  return (
    <div className="flex flex-col gap-3">
      <Text weight="bolder" className="text-muted-fg" children="Regole" />

      {value.length === 0 ? (
        <Text
          className="text-muted-fg"
          children="Nessuna regola impostata. Verranno create insieme alla voce."
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          {value.map(req => (
            <div
              key={req.key}
              className={cn(
                "flex items-center justify-between gap-2 rounded border px-3 py-2 cursor-pointer",
                editingKey === req.key
                  ? "border-primary bg-muted-bg"
                  : "border-border"
              )}
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
                  children={req.requiredDefinitionCategoryName}
                />
                <Text children={req.requiredDefinitionName} />
                {req.groupId != null && (
                  <Text
                    size={0}
                    className="text-muted-fg"
                    children={`(gruppo ${req.groupId})`}
                  />
                )}
              </div>
              <Btn
                icon="close"
                tooltip="Rimuovi regola"
                small
                onClick={event => {
                  event.stopPropagation();
                  handleRemove(req.key);
                }}
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <FieldSelect
            className="w-[140px]"
            label="Tipo"
            value={newType}
            items={REQUIREMENT_TYPE_ITEMS}
            onChange={nextType => {
              const type = nextType as RequirementType;
              setNewType(type);
              if (!GROUPABLE_TYPES.includes(type)) {
                setNewGroupId("");
              }
            }}
          />
          <RequirementTargetSelect
            key={editingKey ?? "new"}
            campaignSlug={campaignSlug}
            type={newType}
            value={newTargetId}
            initialCategoryLabel={
              editingKey != null ? newTargetCategoryLabel : undefined
            }
            onChange={(nextId, nextLabel, nextCategoryLabel) => {
              setNewTargetId(nextId);
              setNewTargetLabel(nextLabel);
              setNewTargetCategoryLabel(nextCategoryLabel);
            }}
          />
          {GROUPABLE_TYPES.includes(newType) && (
            <FieldText
              className="w-[110px]"
              label="Gruppo OR"
              placeholder="opzionale"
              value={newGroupId}
              onChange={nextGroupId =>
                // Oltre ai non-numerici, rimuove anche gli zeri iniziali,
                // stessa pulizia di `RulesSection`.
                setNewGroupId(
                  nextGroupId.replace(/[^0-9]/g, "").replace(/^0+/, "")
                )
              }
            />
          )}
        </div>
        <div className="flex gap-2">
          {editingKey != null && <Btn label="ANNULLA" onClick={resetForm} />}
          <Btn
            label={editingKey != null ? "AGGIORNA" : "AGGIUNGI"}
            disabled={!newTargetId}
            onClick={editingKey != null ? handleUpdate : handleAdd}
          />
        </div>
      </div>
    </div>
  );
};

export default DraftRulesEditor;
