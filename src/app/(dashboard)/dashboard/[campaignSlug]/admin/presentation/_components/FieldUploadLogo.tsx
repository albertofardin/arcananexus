"use client";

import * as React from "react";
import FieldUpload, { useUploadImage } from "./FieldUpload";
import { useToast } from "@/components/_core/Toast";
import { useUploadThing } from "@/lib/uploadthing-client";

export interface IFieldUploadLogo {
  campaignSlug: string;
  src: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}

const FieldUploadLogo = ({
  campaignSlug,
  src,
  onChange,
  disabled = false,
}: IFieldUploadLogo) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const { startUpload, isUploading } = useUploadThing("campaignLogoUploader", {
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
    deleteUrl: `/api/campaigns/${campaignSlug}/logo`,
    campaignSlug,
    onChange,
  });

  return (
    <FieldUpload
      label="Logo"
      icon="camera"
      placeholder="Nessun logo caricato"
      src={src}
      busy={busy}
      fileInputRef={fileInputRef}
      onFileChange={handleFileChange}
      confirmOpen={confirmOpen}
      setConfirmOpen={setConfirmOpen}
      removing={removing}
      onConfirmRemove={handleConfirmRemove}
      confirmTitle="Rimuovi logo"
      confirmMessage="Sei sicuro di voler rimuovere il logo della campagna? Potrai caricarne uno nuovo in qualsiasi momento."
      disabled={disabled}
    />
  );
};

export default FieldUploadLogo;
