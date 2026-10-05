"use client";

import * as React from "react";
import Image from "next/image";
import Btn from "@/components/_core/Btn";
import CircularProgress from "@/components/_core/CircularProgress";
import Icon from "@/components/_core/Icon";
import Modal from "@/components/_core/Modal";
import Text from "@/components/_core/Text";
import { useToast } from "@/components/_core/Toast";
import { useUploadThing } from "@/lib/uploadthing-client";
import { convertImageFileToWebp } from "@/components/AvatarUpload/AvatarUpload";
import {
  CAMPAIGN_IMAGE_WEBP_QUALITY,
  MAX_CAMPAIGN_GALLERY_IMAGES,
  type CampaignPresentation,
} from "@/lib/validations/campaignPresentationUpload";

const MAX_SIZE_BYTES = 4 * 1024 * 1024;
const WEBP_QUALITY = CAMPAIGN_IMAGE_WEBP_QUALITY / 100;

export interface IFieldGallery {
  campaignSlug: string;
  images: CampaignPresentation["images"];
  onChanged: () => void;
  disabled?: boolean;
}

const FieldGallery = ({
  campaignSlug,
  images,
  onChanged,
  disabled = false,
}: IFieldGallery) => {
  const { showToast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [converting, setConverting] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<number | null>(
    null
  );

  const { startUpload, isUploading } = useUploadThing(
    "campaignGalleryUploader",
    {
      onClientUploadComplete: () => {
        showToast({ variant: "success", message: "Immagini caricate" });
        onChanged();
      },
      onUploadError: error => {
        showToast({
          variant: "error",
          message: error.message || "Errore durante il caricamento",
        });
      },
    }
  );

  const remainingSlots = MAX_CAMPAIGN_GALLERY_IMAGES - images.length;
  const busy = isUploading || converting;

  const handleFileChange = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (selected.length === 0) return;

      const files = selected.slice(0, remainingSlots);
      if (files.length < selected.length) {
        showToast({
          variant: "info",
          message: `Puoi caricare al massimo ${MAX_CAMPAIGN_GALLERY_IMAGES} immagini: solo le prime ${files.length} verranno caricate`,
        });
      }

      const oversize = files.find(file => file.size > MAX_SIZE_BYTES);
      if (oversize) {
        showToast({
          variant: "error",
          message: "Immagine troppo grande (massimo 4MB)",
        });
        return;
      }

      setConverting(true);
      let toUpload: File[];
      try {
        toUpload = await Promise.all(
          files.map(file =>
            file.type === "image/webp"
              ? file
              : convertImageFileToWebp(file, WEBP_QUALITY)
          )
        );
      } finally {
        setConverting(false);
      }

      await startUpload(toUpload, { campaignSlug });
    },
    [campaignSlug, remainingSlots, showToast, startUpload]
  );

  const handleDelete = React.useCallback(async () => {
    if (pendingDeleteId === null) return;

    setDeletingId(pendingDeleteId);
    try {
      const response = await fetch(
        `/api/campaigns/${campaignSlug}/gallery/${pendingDeleteId}`,
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error("Errore durante l'eliminazione");

      showToast({ variant: "success", message: "Immagine eliminata" });
      onChanged();
      setPendingDeleteId(null);
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: "Errore durante l'eliminazione dell'immagine",
      });
    } finally {
      setDeletingId(null);
    }
  }, [campaignSlug, onChanged, pendingDeleteId, showToast]);

  return (
    <>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        {images.map(image => (
          <div
            key={image.id}
            className="group relative aspect-[2/1] overflow-hidden rounded border border-border bg-muted-bg"
          >
            <Image
              src={image.url}
              alt=""
              fill
              sizes="(min-width: 640px) 33vw, 100vw"
              className="object-cover"
            />
            {!disabled && (
              <Btn
                icon="delete"
                tooltip="Elimina immagine"
                color="var(--fail)"
                variant="bold"
                disabled={deletingId === image.id}
                onClick={() => setPendingDeleteId(image.id)}
                className="absolute right-1 top-1 border border-card transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
              />
            )}
          </div>
        ))}

        {!disabled && remainingSlots > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="flex aspect-[2/1] flex-col items-center justify-center gap-1 rounded border-2 border-dashed border-border text-muted-fg transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-60"
          >
            {busy ? (
              <CircularProgress size={28} />
            ) : (
              <>
                <Icon size="lg" children="add_photo_alternate" />
                <Text children="Aggiungi" />
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {remainingSlots <= 0 && (
        <Text
          className="mt-2 text-muted-fg"
          children={`Hai raggiunto il numero massimo di ${MAX_CAMPAIGN_GALLERY_IMAGES} immagini`}
        />
      )}

      <Modal
        open={pendingDeleteId !== null}
        onClose={() => setPendingDeleteId(null)}
        title="Elimina immagine"
        content={
          <Text children="Sei sicuro di voler eliminare questa immagine dalla galleria? L'operazione non è reversibile." />
        }
        actionsLoading={deletingId !== null}
        actions={
          <>
            <Btn label="ANNULLA" onClick={() => setPendingDeleteId(null)} />
            <Btn
              variant="bold"
              label="ELIMINA"
              color="var(--fail)"
              onClick={handleDelete}
            />
          </>
        }
      />
    </>
  );
};

export default FieldGallery;
