"use client";

import * as React from "react";
import { useToast } from "@/components/_core/Toast";

// Riordino manuale (master-gated, pulsanti su/giù) condiviso da
// `CatalogManager`, `PagesManager` e `DocumentsManager`: tutti e tre i
// `renderAs` ordinano le proprie voci allo stesso modo lato server
// (`order desc`, applicato dalle query di listing in
// `referenceData.repository.ts`) e usano la stessa route di riordino.
// Opera sull'elenco completo passato (mai su una vista filtrata/cercata: gli
// indici non corrisponderebbero più a posizioni adiacenti reali), il
// chiamante è responsabile di nascondere i pulsanti quando serve.
export function useManualReorder(
  campaignSlug: string,
  dataTypeId: number,
  entries: { id: number }[],
  onReordered: () => void
) {
  const { showToast } = useToast();
  const [reordering, setReordering] = React.useState(false);

  const handleMove = React.useCallback(
    async (index: number, direction: -1 | 1) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= entries.length) return;

      const orderedIds = entries.map(entry => entry.id);
      [orderedIds[index], orderedIds[targetIndex]] = [
        orderedIds[targetIndex],
        orderedIds[index],
      ];

      setReordering(true);
      try {
        const response = await fetch(
          `/api/campaigns/${campaignSlug}/data-types/${dataTypeId}/reorder`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderedIds }),
          }
        );

        if (!response.ok) {
          const json = await response.json().catch(() => null);
          showToast({
            variant: "error",
            message: json?.error ?? "Errore durante il riordino",
          });
          return;
        }

        onReordered();
      } catch (err) {
        console.error(err);
        showToast({ variant: "error", message: "Errore durante il riordino" });
      } finally {
        setReordering(false);
      }
    },
    [campaignSlug, dataTypeId, entries, onReordered, showToast]
  );

  return { reordering, handleMove };
}
