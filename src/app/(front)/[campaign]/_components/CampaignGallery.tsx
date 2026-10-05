"use client";

import * as React from "react";
import Image from "next/image";
import styles from "../../corporate.module.css";

const AUTOPLAY_MS = 5000;

interface CampaignGalleryProps {
  images: { id: number; url: string }[];
  accentColor: string;
}

/**
 * Immagine grande al centro + filmstrip di miniature sotto: avanza da sola
 * ogni `AUTOPLAY_MS` e si aggiorna subito al click su una miniatura.
 */
const CampaignGallery = ({ images, accentColor }: CampaignGalleryProps) => {
  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    if (images.length < 2) return;
    const id = setInterval(() => {
      setActive(current => (current + 1) % images.length);
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [images.length]);

  if (images.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div
        key={images[active].id}
        className={`${styles.fadeIn} relative aspect-video rounded-2xl overflow-hidden border border-ad-border shadow-[0_20px_44px_rgba(20,18,16,0.12)]`}
      >
        <Image
          src={images[active].url}
          alt=""
          fill
          priority={active === 0}
          sizes="(max-width: 768px) 100vw, 900px"
          className="object-cover"
        />
      </div>

      {images.length > 1 && (
        <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {images.map((image, i) => (
            <button
              key={image.id}
              type="button"
              aria-label={`Mostra immagine ${i + 1}`}
              aria-current={i === active}
              onClick={() => setActive(i)}
              className="relative w-20 h-14 sm:w-24 sm:h-16 shrink-0 rounded-lg overflow-hidden border-2 transition-[border-color,opacity] duration-200"
              style={{
                borderColor: i === active ? accentColor : "transparent",
                opacity: i === active ? 1 : 0.6,
              }}
            >
              <Image
                src={image.url}
                alt=""
                fill
                sizes="100px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default CampaignGallery;
