"use client";

import * as React from "react";

export interface MarkDowntimeReadProps {
  campaignSlug: string;
  downtimeId: number;
}

// Segna la downtime come letta al primo mount REALE nel browser (T-0xx,
// badge Aperta/Non letta in `DowntimeRow.tsx`): la pagina server la
// renderizza solo quando il viewer è davvero un master e la downtime non è
// già letta (vedi `page.tsx`) — questo componente esiste solo per garantire
// che la scrittura scatti al mount client, mai durante il prefetch di
// `<Link>` in `DowntimeRow.tsx` (che non esegue mai JS client-side, quindi
// non rischia falsi positivi solo perché la downtime è scorsa in lista).
// Non renderizza nulla: nessuna UI propria, solo l'effetto collaterale.
// Stesso identico ruolo di `MarkMissiveRead.tsx`.
const MarkDowntimeRead = ({
  campaignSlug,
  downtimeId,
}: MarkDowntimeReadProps) => {
  React.useEffect(() => {
    // Best-effort: un fallimento qui non deve interrompere la lettura della
    // downtime né mostrare un errore all'utente, resta semplicemente "Non
    // letta" finché non riprova (prossima apertura).
    fetch(`/api/campaigns/${campaignSlug}/downtime/${downtimeId}/read`, {
      method: "PATCH",
    }).catch(() => {});
  }, [campaignSlug, downtimeId]);

  return null;
};

export default MarkDowntimeRead;
