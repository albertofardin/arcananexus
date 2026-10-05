"use client";

import * as React from "react";
import FieldUpload, { useUploadImage } from "./FieldUpload";
import { useToast } from "@/components/_core/Toast";
import { useUploadThing } from "@/lib/uploadthing-client";

export interface IFieldUploadCover {
  campaignSlug: string;
  src: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}

const FieldUploadCover = ({
  campaignSlug,
  src,
  onChange,
  disabled = false,
}: IFieldUploadCover) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const { startUpload, isUploading } = useUploadThing("campaignCoverUploader", {
    onClientUploadComplete: res => {
      const url = res?.[0]?.serverData?.url;
      if (!url) return;
      onChange(url);
      showToast({ variant: "success", message: "Immagine aggiornata" });
    },
    onUploadError: error => {
      showToast({
        variant: "error",
        message: error.message || "Errore durante il caricamento",
      });
    },
  });

  const {
    busy,
    confirmOpen,
    setConfirmOpen,
    removing,
    handleFileChange,
    handleConfirmRemove,
  } = useUploadImage({
    startUpload,
    isUploading,
    deleteUrl: `/api/campaigns/${campaignSlug}/cover`,
    campaignSlug,
    onChange,
  });

  return (
    <FieldUpload
      label="Copertina"
      icon="image"
      placeholder="Nessuna copertina caricata"
      src={src}
      busy={busy}
      fileInputRef={fileInputRef}
      onFileChange={handleFileChange}
      confirmOpen={confirmOpen}
      setConfirmOpen={setConfirmOpen}
      removing={removing}
      onConfirmRemove={handleConfirmRemove}
      confirmTitle="Rimuovi copertina"
      confirmMessage="Sei sicuro di voler rimuovere l'immagine di copertina? Potrai caricarne una nuova in qualsiasi momento."
      disabled={disabled}
    />
  );
};

export default FieldUploadCover;
