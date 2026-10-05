"use client";

import * as React from "react";

const DEFAULT_RETRY_MAX = 3;
const MIN_RETRY_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 5000;

// Ritardo variabile prima di un retry: un valore fisso farebbe ripartire
// tutti gli avatar/loghi di una pagina esattamente nello stesso istante,
// concentrando un piccolo burst di richieste contro l'origin invece di
// distribuirle nel tempo.
function getRetryDelay(): number {
  return (
    MIN_RETRY_DELAY_MS +
    Math.floor(Math.random() * (MAX_RETRY_DELAY_MS - MIN_RETRY_DELAY_MS))
  );
}

// Solo gli URL remoti (UploadThing) soffrono di propagazione CDN in ritardo:
// un asset locale sotto `/public` è disponibile già al build, quindi un
// 404 lì è un riferimento davvero rotto (mai risolvibile ritentando lo
// stesso URL) — e da Next 16 in poi una querystring su un path locale
// richiederebbe comunque `images.localPatterns` in `next.config.ts`
// (altrimenti runtime error "not configured in images.localPatterns").
function isRemoteUrl(srcUrl: string): boolean {
  return /^https?:\/\//.test(srcUrl);
}

// Appende una querystring diversa ad ogni tentativo: senza, un retry
// richiederebbe lo stesso identico URL appena fallito, che browser e
// ottimizzatore immagini di Next potrebbero servire da una cache di errore
// invece di ritentare davvero il fetch.
function withRetryParam(srcUrl: string, retry: number): string {
  return `${srcUrl}${srcUrl.includes("?") ? "&" : "?"}try=${retry}`;
}

export interface UseRetryableImageSrcResult {
  // `undefined` sia quando `srcUrl` non è impostato sia dopo aver esaurito
  // i tentativi (o dopo un errore su un asset locale, mai ritentato): il
  // chiamante mostra il fallback (iniziali/icona) in entrambi i casi, senza
  // bisogno di distinguerli.
  src: string | undefined;
  onError: () => void;
}

// UploadThing (il provider di storage di avatar/loghi, vedi `remotePatterns`
// in next.config.ts) può restituire un 404 per qualche secondo subito dopo
// un upload, prima che il file propaghi sulla CDN: se il caricamento di un
// URL remoto fallisce, riprova fino a `retryMax` volte con un breve ritardo
// invece di mostrare subito un avatar rotto. Gli asset locali non vengono
// mai ritentati (vedi `isRemoteUrl`).
export function useRetryableImageSrc(
  srcUrl: string | undefined,
  retryMax: number = DEFAULT_RETRY_MAX
): UseRetryableImageSrcResult {
  const [retry, setRetry] = React.useState(1);
  const [failed, setFailed] = React.useState(!srcUrl);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Un nuovo `srcUrl` dal chiamante (es. il personaggio ha cambiato avatar)
  // riparte da zero: la dipendenza è sul prop grezzo, non su `src` derivato,
  // quindi i nostri stessi retry (che cambiano solo la querystring) non
  // fanno ripartire questo effetto.
  React.useEffect(() => {
    setRetry(1);
    setFailed(!srcUrl);
  }, [srcUrl]);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const onError = React.useCallback(() => {
    if (!srcUrl || !isRemoteUrl(srcUrl)) {
      setFailed(true);
      return;
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (retry >= retryMax) {
        setFailed(true);
      } else {
        setRetry(retry + 1);
      }
    }, getRetryDelay());
  }, [srcUrl, retry, retryMax]);

  const src =
    !srcUrl || failed
      ? undefined
      : isRemoteUrl(srcUrl)
        ? withRetryParam(srcUrl, retry)
        : srcUrl;

  return { src, onError };
}
