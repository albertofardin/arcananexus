"use client";

import * as React from "react";
import { DataTypeKind } from "@prisma/client";
import { VISIBILITY_ITEMS, type ContentEntry } from "./types";
import { useEntryForm } from "./useEntryForm";
import RulesSection from "./RulesSection";
import DraftRulesEditor from "./DraftRulesEditor";
import { REFERENCE_DATA_FLAG_LABELS as FLAG_LABELS } from "@/lib/labels";
import Btn from "@/components/_core/Btn";
import Modal from "@/components/_core/Modal";
import Divider from "@/components/_core/Divider";
import FieldText from "@/components/_core/FieldText";
import FieldSelect from "@/components/_core/FieldSelect";
import BtnCheckbox from "@/components/_core/BtnCheckbox";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

// A differenza degli altri kind (gestiti genericamente da
// `ModalEditDataCatalog`/`FlagsForm`, che derivano il widget dallo schema
// Zod), i talenti hanno attributi fissi e ben noti: qui sono hardcoded per
// poterli disporre e raggruppare in un layout pensato apposta, invece che
// impilarli nell'ordine dichiarato dallo schema.
interface TalentFlagsValue {
  cost?: number;
  repeatable?: boolean;
  maxRepetitions?: number;
  creationOnly?: boolean;
  category?: string;
  isDowntimeUsable?: boolean;
  isMissivePointBonus?: boolean;
  isDowntimePointBonus?: boolean;
}

export interface IModalEditDataTalent {
  open: boolean;
  editing: ContentEntry | null;
  campaignSlug: string;
  dataTypeId: number;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
  missiveActive?: boolean;
  downtimeActive?: boolean;
  categories?: string[];
}

const ModalEditDataTalent = ({
  open,
  editing,
  campaignSlug,
  dataTypeId,
  onClose,
  onSaved,
  onDelete,
  missiveActive,
  downtimeActive,
  categories = [],
}: IModalEditDataTalent) => {
  const { form, patch, submitting, nameValid, handleSubmit } = useEntryForm({
    open,
    editing,
    campaignSlug,
    dataTypeId,
    onClose,
    onSaved,
    advanced: { kind: DataTypeKind.talent },
  });
  const isMobile = useIsMobile();

  const flags = form.flags as TalentFlagsValue;
  const patchFlags = (next: Partial<TalentFlagsValue>) =>
    patch({ flags: { ...form.flags, ...next } });
  // Include la categoria corrente anche se nuova (non ancora salvata).
  const categoryItems = Array.from(
    new Set([...categories, ...(flags.category ? [flags.category] : [])])
  ).map(c => ({ id: c, label: c }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Modifica talento" : "Nuovo talento"}
      fullscreen={isMobile}
      content={
        <div className="flex flex-col gap-4 w-full sm:w-[680px]">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex flex-col flex-1 gap-3">
              <FieldText
                label="Titolo"
                labelMandatory
                placeholder="Titolo..."
                value={form.name}
                onChange={name => patch({ name })}
              />
              <div className="flex items-end gap-2">
                <FieldText
                  className="w-1/3"
                  label={FLAG_LABELS.cost}
                  labelMandatory
                  inputType="number"
                  value={flags.cost === undefined ? "" : String(flags.cost)}
                  onChange={next =>
                    patchFlags({
                      cost: next.trim() === "" ? undefined : Number(next),
                    })
                  }
                />
                <FieldSelect
                  className="flex-1"
                  label={FLAG_LABELS.category}
                  creatable
                  value={flags.category}
                  items={categoryItems}
                  onChange={next =>
                    patchFlags({
                      category: next === undefined ? undefined : String(next),
                    })
                  }
                />
              </div>
              <FieldText
                label="Descrizione"
                multiline
                value={form.description}
                onChange={description => patch({ description })}
                placeholder="Descrizione..."
                inputClassName="min-h-[140px]"
              />
            </div>

            <div className="hidden sm:block w-px bg-border" />

            <div className="flex flex-col flex-1 gap-3">
              <FieldSelect
                label="Visibilità giocatori"
                value={form.visibility}
                items={VISIBILITY_ITEMS}
                onChange={value =>
                  patch({ visibility: value as typeof form.visibility })
                }
              />
              <div className="flex items-end gap-2 mt-5">
                <div className="flex-1">
                  <BtnCheckbox
                    className="w-full"
                    label={FLAG_LABELS.repeatable}
                    selected={!!flags.repeatable}
                    onClick={checked => patchFlags({ repeatable: checked })}
                  />
                </div>
                <FieldText
                  className={cn("flex-1", !flags.repeatable && "opacity-40")}
                  disabled={!flags.repeatable}
                  placeholder={FLAG_LABELS.maxRepetitions}
                  inputType="number"
                  value={
                    flags.maxRepetitions === undefined
                      ? ""
                      : String(flags.maxRepetitions)
                  }
                  onChange={next =>
                    patchFlags({
                      maxRepetitions:
                        next.trim() === "" ? undefined : Number(next),
                    })
                  }
                />
              </div>

              <BtnCheckbox
                className="w-full"
                label={FLAG_LABELS.creationOnly}
                selected={!!flags.creationOnly}
                onClick={checked => patchFlags({ creationOnly: checked })}
              />

              <BtnCheckbox
                className="w-full"
                label={FLAG_LABELS.isDowntimeUsable}
                selected={!!flags.isDowntimeUsable}
                onClick={checked => patchFlags({ isDowntimeUsable: checked })}
              />
              <div className="flex items-end gap-2">
                {missiveActive && (
                  <BtnCheckbox
                    className="w-full"
                    label={FLAG_LABELS.isMissivePointBonus}
                    selected={!!flags.isMissivePointBonus}
                    onClick={checked =>
                      patchFlags({ isMissivePointBonus: checked })
                    }
                  />
                )}
                {downtimeActive && (
                  <BtnCheckbox
                    className="w-full"
                    label={FLAG_LABELS.isDowntimePointBonus}
                    selected={!!flags.isDowntimePointBonus}
                    onClick={checked =>
                      patchFlags({ isDowntimePointBonus: checked })
                    }
                  />
                )}
              </div>
            </div>
          </div>

          <Divider />
          {editing ? (
            <RulesSection campaignSlug={campaignSlug} referenceData={editing} />
          ) : (
            <DraftRulesEditor
              campaignSlug={campaignSlug}
              value={form.requirements}
              onChange={requirements => patch({ requirements })}
            />
          )}
        </div>
      }
      actionsLoading={submitting}
      actions={
        <>
          {onDelete && (
            <Btn
              variant="bold"
              label="ELIMINA"
              color="var(--fail)"
              onClick={onDelete}
            />
          )}
          <div className="flex-1" />
          <Btn label="ANNULLA" onClick={onClose} />
          <Btn
            className="min-w-[100px] text-center"
            color="var(--succ)"
            variant="bold"
            label={editing ? "SALVA" : "CREA"}
            disabled={!nameValid}
            onClick={handleSubmit}
          />
        </>
      }
    />
  );
};

export default ModalEditDataTalent;
