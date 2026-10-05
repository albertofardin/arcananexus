"use client";

import * as React from "react";
import { VISIBILITY_ITEMS, type ContentEntry } from "./types";
import { useEntryForm, type EntryFormAdvancedConfig } from "./useEntryForm";
import FlagsForm from "./FlagsForm";
import RulesSection from "./RulesSection";
import DraftRulesEditor from "./DraftRulesEditor";
import Btn from "@/components/_core/Btn";
import Modal from "@/components/_core/Modal";
import Divider from "@/components/_core/Divider";
import FieldText from "@/components/_core/FieldText";
import FieldSelect from "@/components/_core/FieldSelect";
import { useIsMobile } from "@/hooks/use-mobile";

export interface IModalEditDataCatalog {
  open: boolean;
  editing: ContentEntry | null;
  campaignSlug: string;
  dataTypeId: number;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
  advanced?: EntryFormAdvancedConfig;
}

const ModalEditDataCatalog = ({
  open,
  editing,
  campaignSlug,
  dataTypeId,
  onClose,
  onSaved,
  onDelete,
  advanced,
}: IModalEditDataCatalog) => {
  const { form, patch, submitting, nameValid, handleSubmit } = useEntryForm({
    open,
    editing,
    campaignSlug,
    dataTypeId,
    onClose,
    onSaved,
    advanced: advanced && { kind: advanced.kind },
  });
  const isMobile = useIsMobile();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Modifica voce" : "Nuova voce"}
      fullscreen={isMobile}
      content={
        <div className="flex flex-col gap-4 w-full sm:w-[680px]">
          <div className="flex flex-col gap-3">
            <FieldText
              label="Titolo"
              labelMandatory
              placeholder="Titolo..."
              value={form.name}
              onChange={name => patch({ name })}
            />
            <FieldSelect
              label="Visibilità giocatori"
              value={form.visibility}
              items={VISIBILITY_ITEMS}
              onChange={value =>
                patch({ visibility: value as typeof form.visibility })
              }
            />
            <FieldText
              className="flex-1"
              label="Descrizione"
              multiline
              multilineFullHeight
              value={form.description}
              onChange={description => patch({ description })}
              placeholder="Descrizione..."
            />
            {advanced && (
              <FlagsForm
                kind={advanced.kind}
                value={form.flags}
                onChange={flags => patch({ flags })}
                missiveActive={advanced.missiveActive}
                downtimeActive={advanced.downtimeActive}
              />
            )}
          </div>
          {advanced && (
            <>
              <Divider />
              {editing ? (
                <RulesSection
                  campaignSlug={campaignSlug}
                  referenceData={editing}
                />
              ) : (
                <DraftRulesEditor
                  campaignSlug={campaignSlug}
                  value={form.requirements}
                  onChange={requirements => patch({ requirements })}
                />
              )}
            </>
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

export default ModalEditDataCatalog;
