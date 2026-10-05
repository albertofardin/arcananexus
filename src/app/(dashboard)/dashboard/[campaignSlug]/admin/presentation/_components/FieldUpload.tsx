"use client";

import * as React from "react";
import CircularProgress from "@/components/_core/CircularProgress";
import FieldText from "@/components/_core/FieldText";
import Modal from "@/components/_core/Modal";
import Btn from "@/components/_core/Btn";
import Text from "@/components/_core/Text";
import PopoverList, { IPopoverListItem } from "@/components/_core/PopoverList";
import { useToast } from "@/components/_core/Toast";
import { convertImageFileToWebp } from "@/components/AvatarUpload/AvatarUpload";
import { CAMPAIGN_IMAGE_WEBP_QUALITY } from "@/lib/validations/campaignPresentationUpload";

// Logica condivisa dai widget logo/copertina (T-045): un solo file,
// sostituito ad ogni upload. Stesso flusso di
// `src/components/AvatarUpload/AvatarUpload.tsx` (fast-path WebP
// lato client via `convertImageFileToWebp`, fallback server per gli altri
// formati). Il chiamante (`ManagerPresentation`) tiene lo stato di questa
// pagina via TanStack Query: `onChange` riceve direttamente l'URL finale da
// `serverData.url`, niente refetch necessario per il form stesso — ma
// chiama comunque `router.refresh()` per riallineare i Server Component
// fuori da questa pagina (sidebar, header) che leggono da Prisma.
//
// Non chiama `useUploadThing` direttamente: le due tipizzazioni overload di
// `useUploadThing` (`src/lib/uploadthing-client.ts`) richiedono un letterale
// per l'endpoint, non una union — passare qui l'endpoint come parametro
// romperebbe la risoluzione dell'overload. `FieldUploadLogo`/`FieldUploadCover`
// chiamano `useUploadThing` col proprio endpoint letterale e passano
// `startUpload`/`isUploading` già risolti a questo hook.

const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4MB, allineato a `campaignLogoUploader`/`campaignCoverUploader` in `src/app/api/uploadthing/core.ts`.
const WEBP_QUALITY = CAMPAIGN_IMAGE_WEBP_QUALITY / 100;

export interface UseUploadImageOptions {
  startUpload: (
    files: File[],
    input: { campaignSlug: string }
  ) => Promise<unknown>;
  isUploading: boolean;
  deleteUrl: string;
  campaignSlug: string;
  onChange: (url: string | null) => void;
  tooLargeMessage?: string;
}

export function useUploadImage({
  startUpload,
  isUploading,
  deleteUrl,
  campaignSlug,
  onChange,
  tooLargeMessage = "Immagine troppo grande (massimo 4MB)",
}: UseUploadImageOptions) {
  const { showToast } = useToast();
  const [removing, setRemoving] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [converting, setConverting] = React.useState(false);

  const busy = isUploading || removing || converting;

  const handleFileChange = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      if (file.size > MAX_SIZE_BYTES) {
        showToast({ variant: "error", message: tooLargeMessage });
        return;
      }

      let toUpload = file;
      if (file.type !== "image/webp") {
        setConverting(true);
        try {
          toUpload = await convertImageFileToWebp(file, WEBP_QUALITY);
        } finally {
          setConverting(false);
        }
      }

      if (toUpload.size > MAX_SIZE_BYTES) {
        showToast({ variant: "error", message: tooLargeMessage });
        return;
      }

      await startUpload([toUpload], { campaignSlug });
    },
    [campaignSlug, showToast, startUpload, tooLargeMessage]
  );

  const handleConfirmRemove = React.useCallback(async () => {
    setRemoving(true);
    try {
      const response = await fetch(deleteUrl, { method: "DELETE" });
      if (!response.ok) throw new Error("Errore durante la rimozione");

      onChange(null);
      showToast({ variant: "success", message: "Immagine rimossa" });
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: "Errore durante la rimozione dell'immagine",
      });
    } finally {
      setRemoving(false);
      setConfirmOpen(false);
    }
  }, [deleteUrl, onChange, showToast]);

  return {
    busy,
    confirmOpen,
    setConfirmOpen,
    removing,
    handleFileChange,
    handleConfirmRemove,
  };
}

export interface IFieldUpload {
  label: string;
  icon: string;
  placeholder: string;
  src: string | null;
  busy: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  confirmOpen: boolean;
  setConfirmOpen: (open: boolean) => void;
  removing: boolean;
  onConfirmRemove: () => void;
  confirmTitle: string;
  confirmMessage: string;
  disabled?: boolean;
}

// Riga `FieldText` di sola lettura che, al click, apre un menu con le azioni
// di upload/rimozione: usata da `FieldUploadLogo`/`FieldUploadCover` per evitare di
// duplicare il wiring di popover + modale di conferma.
const FieldUpload = ({
  label,
  icon,
  placeholder,
  src,
  busy,
  fileInputRef,
  onFileChange,
  confirmOpen,
  setConfirmOpen,
  removing,
  onConfirmRemove,
  confirmTitle,
  confirmMessage,
  disabled = false,
}: IFieldUpload) => {
  const fieldRef = React.useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);

  const menuActions = React.useMemo<IPopoverListItem[]>(
    () => [
      {
        id: "upload",
        label: "Carica nuova immagine",
        icon: "add_a_photo",
        onClick: () => fileInputRef.current?.click(),
      },
      {
        id: "delete",
        label: "Elimina immagine",
        icon: "delete",
        color: "var(--fail)",
        hidden: !src,
        onClick: () => setConfirmOpen(true),
      },
    ],
    [src, setConfirmOpen, fileInputRef]
  );

  return (
    <div ref={fieldRef} className="relative">
      <FieldText
        inputClassName={!disabled ? "cursor-pointer" : ""}
        label={label}
        icon={icon}
        value={src ?? ""}
        placeholder={placeholder}
        readOnly
        disabled={disabled}
        onClick={disabled ? undefined : () => setMenuOpen(true)}
      />
      {busy && (
        <div className="absolute inset-0 top-5 flex items-center justify-end p-3 rounded bg-[#000]/35">
          <CircularProgress size={20} color="#fff" />
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onFileChange}
      />
      <PopoverList
        open={menuOpen}
        anchorEl={fieldRef.current}
        actions={menuActions}
        onClose={() => setMenuOpen(false)}
        originAnchor={{ vertical: "bottom", horizontal: "left" }}
        originTransf={{ vertical: "top", horizontal: "left" }}
        style={{ minWidth: fieldRef.current?.offsetWidth }}
      />
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={confirmTitle}
        content={<Text children={confirmMessage} />}
        actionsLoading={removing}
        actions={
          <>
            <Btn label="ANNULLA" onClick={() => setConfirmOpen(false)} />
            <Btn
              variant="bold"
              label="RIMUOVI"
              color="var(--fail)"
              onClick={onConfirmRemove}
            />
          </>
        }
      />
    </div>
  );
};

export default FieldUpload;
