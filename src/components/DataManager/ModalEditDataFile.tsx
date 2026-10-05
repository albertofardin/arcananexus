"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DataVisibility } from "@prisma/client";
import { VISIBILITY_ITEMS, type DocumentEntry } from "./types";
import { useEntryForm } from "./useEntryForm";
import Btn from "@/components/_core/Btn";
import InputFile from "@/components/_core/InputFile";
import Modal from "@/components/_core/Modal";
import FieldText from "@/components/_core/FieldText";
import FieldSelect from "@/components/_core/FieldSelect";
import { useToast } from "@/components/_core/Toast";
import { useUploadThing } from "@/lib/uploadthing-client";
import { useIsMobile } from "@/hooks/use-mobile";

export interface IModalEditDataFile {
  open: boolean;
  editing: DocumentEntry | null;
  campaignSlug: string;
  dataTypeId: number;
  onClose: () => void;
  onSaved?: () => void;
  onDelete?: () => void;
}

// Le due modalità (crea / sostituisci file) usano ciascuna il proprio
// `useUploadThing`: separarle in due componenti evita di montare entrambe
// le hook di upload insieme quando si renderizza solo una modalità.
const ModalEditDataFile = (props: IModalEditDataFile) =>
  props.editing ? (
    <ModalReplaceDocument {...props} editing={props.editing} />
  ) : (
    <ModalUploadDocument {...props} />
  );

export default ModalEditDataFile;

interface IModalReplaceDocument extends Omit<IModalEditDataFile, "editing"> {
  editing: DocumentEntry;
}

const ModalReplaceDocument = ({
  open,
  editing,
  campaignSlug,
  dataTypeId,
  onClose,
  onSaved,
  onDelete,
}: IModalReplaceDocument) => {
  const router = useRouter();
  const { showToast } = useToast();
  const isMobile = useIsMobile();

  const { form, patch, submitting, nameValid, handleSubmit } = useEntryForm({
    open,
    editing,
    campaignSlug,
    dataTypeId,
    onClose,
    onSaved: () => onSaved?.(),
  });

  const { startUpload: startReplaceUpload, isUploading: isReplacing } =
    useUploadThing("documentUploader", {
      onClientUploadComplete: () => {
        showToast({ variant: "success", message: "File sostituito" });
        onClose();
        router.refresh();
        onSaved?.();
      },
      onUploadError: error => {
        showToast({
          variant: "error",
          message: error.message || "Errore durante il caricamento",
        });
      },
    });

  const handleReplaceFile = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      if (!form.name.trim()) {
        showToast({
          variant: "error",
          message: "Inserisci un titolo prima di scegliere il file",
        });
        return;
      }

      await startReplaceUpload([file], {
        campaignSlug,
        dataTypeId,
        title: form.name.trim(),
        referenceDataId: editing.id,
      });
    },
    [
      campaignSlug,
      dataTypeId,
      editing.id,
      form.name,
      showToast,
      startReplaceUpload,
    ]
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Modifica documento"
      fullscreen={isMobile}
      content={
        <>
          <Btn
            className="w-full min-w-full"
            variant="bold"
            icon="upload_file"
            label={isReplacing ? "Caricamento…" : "Sostituisci file"}
            disabled={submitting || isReplacing || !nameValid}
            onClick={() => null}
            children={
              <InputFile
                onChangeInput={handleReplaceFile}
                disabled={submitting || isReplacing || !nameValid}
              />
            }
          />
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
            onChange={value => patch({ visibility: value as DataVisibility })}
          />
          <FieldText
            label="Descrizione"
            multiline
            value={form.description}
            onChange={description => patch({ description })}
            placeholder="Descrizione..."
          />
        </>
      }
      actionsLoading={submitting}
      actions={
        <>
          {onDelete && (
            <Btn
              variant="bold"
              label="ELIMINA"
              color="var(--fail)"
              disabled={isReplacing}
              onClick={onDelete}
            />
          )}
          <div className="flex-1" />
          <Btn label="ANNULLA" onClick={onClose} />
          <Btn
            color="var(--succ)"
            variant="bold"
            label="SALVA"
            disabled={!nameValid}
            onClick={handleSubmit}
          />
        </>
      }
    />
  );
};

const ModalUploadDocument = ({
  open,
  campaignSlug,
  dataTypeId,
  onClose,
  onSaved,
}: Omit<IModalEditDataFile, "editing">) => {
  const isMobile = useIsMobile();
  const router = useRouter();
  const { showToast } = useToast();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [visibility, setVisibility] = React.useState<DataVisibility>(
    DataVisibility.visible
  );

  const { startUpload, isUploading } = useUploadThing("documentUploader", {
    onClientUploadComplete: () => {
      showToast({ variant: "success", message: "Documento salvato" });
      setTitle("");
      setDescription("");
      setVisibility(DataVisibility.visible);
      onClose();
      router.refresh();
      onSaved?.();
    },
    onUploadError: error => {
      showToast({
        variant: "error",
        message: error.message || "Errore durante il caricamento",
      });
    },
  });

  const handleFile = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // consente di riselezionare lo stesso file in seguito
      event.target.value = "";
      if (!file) return;

      if (!title.trim()) {
        showToast({
          variant: "error",
          message: "Inserisci un titolo prima di scegliere il file",
        });
        return;
      }

      await startUpload([file], {
        campaignSlug,
        dataTypeId,
        title: title.trim(),
        description: description.trim() || undefined,
        visibility,
      });
    },
    [
      campaignSlug,
      dataTypeId,
      description,
      showToast,
      startUpload,
      title,
      visibility,
    ]
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      fullscreen={isMobile}
      title="Carica un nuovo documento"
      content={
        <>
          <FieldText
            label="Titolo"
            labelMandatory
            placeholder="Titolo..."
            value={title}
            onChange={setTitle}
          />
          <FieldSelect
            label="Visibilità giocatori"
            value={visibility}
            items={VISIBILITY_ITEMS}
            onChange={value => setVisibility(value as DataVisibility)}
          />
          <FieldText
            label="Descrizione"
            multiline
            value={description}
            onChange={setDescription}
            placeholder="Descrizione..."
          />
        </>
      }
      actionsLoading={isUploading}
      actions={
        <>
          <Btn label="ANNULLA" onClick={onClose} />
          <Btn
            color="var(--succ)"
            variant="bold"
            icon="upload_file"
            label="SELEZIONA FILE"
            onClick={() => null}
            children={<InputFile onChangeInput={handleFile} />}
          />
        </>
      }
    />
  );
};
