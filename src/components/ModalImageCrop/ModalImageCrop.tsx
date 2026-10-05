"use client";

import * as React from "react";
import Cropper, { type Area } from "react-easy-crop";
import Modal from "@/components/_core/Modal";
import Btn from "@/components/_core/Btn";
import { useIsMobile } from "@/hooks/use-mobile";
import { CAMPAIGN_IMAGE_WEBP_QUALITY } from "@/lib/validations/campaignPresentationUpload";

// ponytail: larghezze massime fisse per forma. 1920 basta per l'hero evento a
// tutta larghezza, 512 per gli avatar (mostrati al più a 150px, anche su
// schermi retina); da alzare se le immagini vengono mostrate più grandi.
const SHAPES = {
  video: { aspect: 16 / 9, maxWidth: 1920 },
  square: { aspect: 1, maxWidth: 512 },
} as const;

export interface IModalImageCrop {
  /** File da ritagliare; `null` = modale chiusa. */
  file: File | null;
  /** Proporzioni del ritaglio: `video` = 16:9 (default), `square` = 1:1. */
  shape?: keyof typeof SHAPES;
  /** Maschera circolare (solo visiva: il file ritagliato resta quadrato). */
  round?: boolean;
  onClose: () => void;
  onConfirm: (cropped: File) => void;
}

/** Ritaglio a proporzioni fisse di un'immagine prima del caricamento. */
const ModalImageCrop = ({
  file,
  shape = "video",
  round,
  onClose,
  onConfirm,
}: IModalImageCrop) => {
  const { aspect, maxWidth } = SHAPES[shape];
  const isMobile = useIsMobile();
  const [crop, setCrop] = React.useState({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [area, setArea] = React.useState<Area | null>(null);
  const [working, setWorking] = React.useState(false);

  const url = React.useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file]
  );
  React.useEffect(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  const confirm = async () => {
    if (!file || !area) return;
    setWorking(true);
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(area.width, maxWidth);
      canvas.height = Math.round(canvas.width / aspect);
      canvas
        .getContext("2d")
        ?.drawImage(
          bitmap,
          area.x,
          area.y,
          area.width,
          area.height,
          0,
          0,
          canvas.width,
          canvas.height
        );
      bitmap.close();
      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, "image/webp", CAMPAIGN_IMAGE_WEBP_QUALITY / 100)
      );
      if (!blob) return;
      // Alcuni browser restituiscono un PNG anche chiedendo WebP: si carica
      // comunque il ritaglio, con il tipo reale. Il nome pubblico lo decide
      // il server.
      onConfirm(
        new File([blob], `immagine.${blob.type.split("/")[1]}`, {
          type: blob.type,
        })
      );
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal
      open={Boolean(file)}
      onClose={onClose}
      title="Ritaglia immagine"
      fullscreen={isMobile}
      className={isMobile ? undefined : "w-[640px]"}
      content={
        <div className="flex flex-col gap-3">
          <div className="relative h-[50dvh] w-full overflow-hidden rounded bg-black">
            {url && (
              <Cropper
                image={url}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                cropShape={round ? "round" : "rect"}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, pixels) => setArea(pixels)}
              />
            )}
          </div>
          <input
            type="range"
            aria-label="Zoom"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
          />
        </div>
      }
      actionsLoading={working}
      actions={
        <>
          <Btn label="ANNULLA" onClick={onClose} />
          <Btn
            variant="bold"
            label="CONFERMA"
            disabled={!area}
            onClick={confirm}
          />
        </>
      }
    />
  );
};

export default ModalImageCrop;
