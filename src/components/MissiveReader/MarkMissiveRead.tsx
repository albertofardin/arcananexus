"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

export interface MarkMissiveReadProps {
  campaignSlug: string;
  missiveId: number;
}

// Segna la missiva come letta al primo mount REALE nel browser (T-0xx,
// badge Ricevuto/Letto in `MissiveRow.tsx`): la pagina server la
// renderizza solo quando il viewer è davvero il proprietario del
// personaggio destinatario e la missiva non è già letta (vedi `page.tsx`)
// — questo componente esiste solo per garantire che la scrittura scatti al
// mount client, mai durante il prefetch di `<Link>` in `MissiveRow.tsx`
// (che non esegue mai JS client-side, quindi non rischia falsi positivi
// solo perché la missiva è scorsa in lista). Non renderizza nulla: nessuna
// UI propria, solo l'effetto collaterale.
const MarkMissiveRead = ({ campaignSlug, missiveId }: MarkMissiveReadProps) => {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    // Best-effort: un fallimento qui non deve interrompere la lettura della
    // missiva né mostrare un errore all'utente, la missiva resta
    // semplicemente "Ricevuto" finché non riprova (prossima apertura).
    // L'invalidazione della query `["missive", campaignSlug, ...]` (usata da
    // `MissiveList`) serve perché quella lista ha `staleTime: 60_000`
    // (`(dashboard)/layout.tsx`): senza invalidarla esplicitamente, tornare
    // all'elenco entro 60s da questa PATCH mostrerebbe ancora "Non ancora
    // letta" da cache, anche se il DB è già aggiornato.
    fetch(`/api/campaigns/${campaignSlug}/missive/${missiveId}/read`, {
      method: "PATCH",
    })
      .then(res => {
        if (res.ok) {
          queryClient.invalidateQueries({
            queryKey: ["missive", campaignSlug],
          });
        }
      })
      .catch(() => {});
  }, [campaignSlug, missiveId, queryClient]);

  return null;
};

export default MarkMissiveRead;
