"use client";

import * as React from "react";
import { VISIBILITY_ITEMS, type ContentEntry } from "./types";
import { useEntryForm } from "./useEntryForm";
import Btn from "@/components/_core/Btn";
import Modal from "@/components/_core/Modal";
import FieldText from "@/components/_core/FieldText";
import FieldSelect from "@/components/_core/FieldSelect";
import FieldRichText from "@/components/_core/FieldRichText";

export interface IModalEditDataPage {
  open: boolean;
  editing: ContentEntry | null;
  campaignSlug: string;
  dataTypeId: number;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
}

const ModalEditDataPage = ({
  open,
  editing,
  campaignSlug,
  dataTypeId,
  onClose,
  onSaved,
  onDelete,
}: IModalEditDataPage) => {
  const { form, patch, submitting, nameValid, handleSubmit } = useEntryForm({
    open,
    editing,
    campaignSlug,
    dataTypeId,
    onClose,
    onSaved,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      fullscreen
      content={
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex gap-3">
            <FieldText
              className="flex-[3]"
              label="Titolo"
              labelMandatory
              placeholder="Titolo..."
              value={form.name}
              onChange={name => patch({ name })}
            />
            <FieldSelect
              className="flex-[1] min-w-[120px]"
              label="Visibilità giocatori"
              value={form.visibility}
              items={VISIBILITY_ITEMS}
              onChange={visibility =>
                patch({ visibility: visibility as typeof form.visibility })
              }
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <FieldRichText
              className="flex-1"
              label="Contenuto"
              value={form.description}
              onChange={description => patch({ description })}
              placeholder="Contenuto..."
              minHeight={240}
              campaignSlug={campaignSlug}
            />
          </div>
        </div>
      }
      actions={
        <>
          {onDelete && (
            <Btn
              variant="bold"
              label="ELIMINA"
              color="var(--fail)"
              disabled={submitting}
              onClick={onDelete}
            />
          )}
          <div className="flex-1" />
          <Btn label="ANNULLA" disabled={submitting} onClick={onClose} />
          <Btn
            variant="bold"
            label={editing ? "SALVA" : "CREA"}
            disabled={submitting || !nameValid}
            onClick={handleSubmit}
          />
        </>
      }
    />
  );
};

export default ModalEditDataPage;
