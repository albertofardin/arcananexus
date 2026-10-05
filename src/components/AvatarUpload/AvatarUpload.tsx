"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import AvatarUser from "../AvatarUser";
import CircularProgress from "../_core/CircularProgress";
import Modal from "../_core/Modal";
import ModalImageCrop from "../ModalImageCrop";
import Btn from "../_core/Btn";
import Text from "../_core/Text";
import { IPopoverListItem } from "../_core/PopoverList";
import { useToast } from "../_core/Toast";
import { useUploadThing } from "@/lib/uploadthing-client";
import {
  AVATAR_WEBP_QUALITY,
  type AvatarUploadInput,
} from "@/lib/validations/avatarUpload";
import { cn } from "@/lib/utils";

// Deve restare allineato al `maxFileSize` di `avatarUploader` in
// `src/app/api/uploadthing/core.ts`: un valore più basso qui darebbe un
// errore client fuorviante, uno più alto lascerebbe il vero limite (quello
// server-side) come unico messaggio d'errore, mostrato da UploadThing.
const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4MB

// `canvas.toBlob` vuole una qualità 0-1, `AVATAR_WEBP_QUALITY` è sulla scala
// 0-100 di sharp (stesso valore usato dal fallback server-side).
const WEBP_QUALITY = AVATAR_WEBP_QUALITY / 100;

// Nome neutro per il file convertito lato client: si tiene solo il nome
// base per leggibilità nei log di rete del browser durante l'upload, non
// finisce nell'URL pubblico (quello lo decide il server, vedi
// `buildUploadedFileName` in `src/lib/uploadedFileName.ts`).
function toWebpFileName(originalName: string): string {
  const base = originalName.replace(/\.[^./\\]+$/, "");
  return `${base || "avatar"}.webp`;
}

/**
 * Converte un'immagine in WebP interamente lato client (T-046), per evitare
 * nel caso comune il round-trip server upload→download→convert(sharp)→
 * re-upload di `convertUploadedAvatarToWebp` (`src/lib/avatarUpload.ts`).
 * Nessun resize: solo conversione di formato, come fa oggi `sharp`
 * server-side.
 *
 * Bug noto di piattaforma: alcuni motori (in particolare Safari/WebKit meno
 * recenti) **ignorano silenziosamente** `"image/webp"` passato a
 * `canvas.toBlob` e restituiscono comunque un blob PNG, senza sollevare
 * errori. Non ci si può fidare dell'assenza di eccezioni: dopo la
 * conversione si controlla esplicitamente `blob.type`.
 *
 * Se la conversione non è disponibile, fallisce, o produce un blob che non è
 * davvero WebP (fallback silenzioso), viene restituito il file **originale**
 * non convertito: il server (`onUploadComplete` di `avatarUploader`,
 * `src/app/api/uploadthing/core.ts`) riconosce questo caso dal MIME ricevuto
 * e usa il round-trip esistente come percorso di compatibilità.
 */
export async function convertImageFileToWebp(
  file: File,
  quality: number
): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const blob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve, "image/webp", quality);
    });

    // Vedi commento sopra: alcuni browser restituiscono un PNG anche quando
    // è stato richiesto esplicitamente "image/webp", senza errore.
    if (!blob || blob.type !== "image/webp") {
      return file;
    }

    return new File([blob], toWebpFileName(file.name), {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } catch (error) {
    // Browser senza `createImageBitmap`/canvas, memoria insufficiente, file
    // non decodificabile come immagine: si procede con l'originale, gestito
    // dal fallback server (round-trip invariato, comportamento pre-T-046).
    console.error("Client-side avatar WebP conversion failed:", error);
    return file;
  }
}

export interface IAvatarUpload {
  className?: string;
  style?: React.CSSProperties;
  /** Endpoint per la rimozione (DELETE, nessun body). Risposta attesa: `{ url: null }`. L'upload passa dal file router UploadThing `avatarUploader` (vedi `uploadInput`), non da questo endpoint. */
  endpoint: string;
  /** Bersaglio dell'upload per `avatarUploader` (profilo utente o personaggio): l'autorizzazione server-side vive in `src/lib/avatarUpload.ts`, mai decisa qui. Opzionale solo per il caso "entità non ancora salvata" (vedi `disabled`), dove comunque non è raggiungibile. */
  uploadInput?: AvatarUploadInput;
  src?: string | null;
  text?: string;
  size?: number;
  circle?: boolean;
  disabled?: boolean;
  disabledMessage?: string;
  onChange: (url: string | null) => void;
}

/** Avatar hero con un pulsante "modifica" che apre un menu (carica / elimina immagine). */
const AvatarUpload = ({
  className,
  style,
  endpoint,
  uploadInput,
  src,
  text,
  size = 150,
  circle,
  disabled,
  disabledMessage = "Salva prima per caricare l'immagine",
  onChange,
}: IAvatarUpload) => {
  const { showToast } = useToast();
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [removing, setRemoving] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [converting, setConverting] = React.useState(false);
  // File scelto in attesa di ritaglio quadrato (vedi `ModalImageCrop`).
  const [cropFile, setCropFile] = React.useState<File | null>(null);

  const { startUpload, isUploading } = useUploadThing("avatarUploader", {
    onClientUploadComplete: res => {
      const url = res?.[0]?.serverData?.url;
      if (!url) return;
      onChange(url);
      showToast({ variant: "success", message: "Immagine aggiornata" });
      router.refresh();
    },
    onUploadError: error => {
      showToast({
        variant: "error",
        message: error.message || "Errore durante il caricamento",
      });
    },
  });

  const busy = isUploading || removing || converting;

  const handleDisabledClick = React.useCallback(() => {
    showToast({ variant: "info", message: disabledMessage });
  }, [disabledMessage, showToast]);

  const handleFileChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // consente di riselezionare lo stesso file in seguito
      event.target.value = "";
      if (!file) return;

      if (!uploadInput) {
        // Non raggiungibile con i chiamanti attuali (il menu di upload è
        // nascosto quando `disabled`, e `uploadInput` è sempre valorizzato
        // altrimenti): invariante implicita e fragile per chiamanti futuri,
        // quindi qui si dà comunque un feedback invece di un no-op silenzioso.
        showToast({ variant: "info", message: disabledMessage });
        return;
      }

      if (file.size > MAX_SIZE_BYTES) {
        showToast({
          variant: "error",
          message: "Immagine troppo grande (massimo 4MB)",
        });
        return;
      }

      setCropFile(file);
    },
    [disabledMessage, showToast, uploadInput]
  );

  const uploadCropped = React.useCallback(
    async (cropped: File) => {
      setCropFile(null);
      if (!uploadInput) return;

      // Il ritaglio esce di norma già WebP: la conversione serve solo sui
      // browser che ignorano "image/webp" in `canvas.toBlob` (vedi
      // `convertImageFileToWebp`), dove resta il fallback server-side.
      let toUpload = cropped;
      if (cropped.type !== "image/webp") {
        setConverting(true);
        try {
          toUpload = await convertImageFileToWebp(cropped, WEBP_QUALITY);
        } finally {
          setConverting(false);
        }
      }

      // Ritaglio e conversione di solito riducono la dimensione, ma non è
      // garantito per ogni input: ricontrollo con lo stesso messaggio
      // d'errore del controllo sul file originale.
      if (toUpload.size > MAX_SIZE_BYTES) {
        showToast({
          variant: "error",
          message: "Immagine troppo grande (massimo 4MB)",
        });
        return;
      }

      await startUpload([toUpload], uploadInput);
    },
    [showToast, startUpload, uploadInput]
  );

  const handleConfirmRemove = React.useCallback(async () => {
    setRemoving(true);
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      if (!response.ok) throw new Error("Errore durante la rimozione");

      onChange(null);
      showToast({ variant: "success", message: "Immagine rimossa" });
      router.refresh();
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
  }, [endpoint, onChange, showToast, router]);

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
    [src]
  );

  return (
    <div className="block">
      <div
        className={cn("relative shrink-0", className)}
        style={{ width: size, height: size, ...style }}
      >
        <AvatarUser
          size={size}
          text={text}
          src={src ?? undefined}
          circle={circle}
          className="border border-card bg-card shadow-md"
        />

        {busy && (
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center bg-black/45",
              circle ? "rounded-full" : "rounded"
            )}
          >
            <CircularProgress size={40} color="var(--bg)" />
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
        <ModalImageCrop
          file={cropFile}
          shape="square"
          round={circle}
          onClose={() => setCropFile(null)}
          onConfirm={uploadCropped}
        />

        <Btn
          icon="camera"
          small
          disabled={busy}
          onClick={disabled ? handleDisabledClick : undefined}
          variant="bold"
          menu={
            disabled
              ? undefined
              : {
                  items: menuActions,
                  originAnchor: { vertical: "bottom", horizontal: "right" },
                  originTransf: { vertical: "top", horizontal: "right" },
                }
          }
          className={cn(
            "absolute rounded-full border border-card",
            circle ? "bottom-2 right-2" : "bottom-[-8px] right-[-8px]"
          )}
        />
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Rimuovi immagine"
        content={
          <Text children="Sei sicuro di voler rimuovere l'immagine? Potrai caricarne una nuova in qualsiasi momento." />
        }
        actionsLoading={removing}
        actions={
          <>
            <Btn label="ANNULLA" onClick={() => setConfirmOpen(false)} />
            <Btn
              variant="bold"
              label="RIMUOVI"
              color="var(--fail)"
              onClick={handleConfirmRemove}
            />
          </>
        }
      />
    </div>
  );
};

export default AvatarUpload;
