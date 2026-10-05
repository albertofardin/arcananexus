import { z } from "zod";

// Risposta di GET /api/me/capabilities: i flag di autorizzazione trasversali
// che servono al gating client-side della navigazione (la sessione Better
// Auth espone solo id/name/email, nessun `isDirettivo`/`isSviluppo`/Grant —
// vedi `src/lib/authorization.ts`).
export const capabilitiesResponseSchema = z.object({
  isDirettivo: z.boolean(),
  isSviluppo: z.boolean(),
  masterCampaigns: z.array(z.string()),
});

export type CapabilitiesResponse = z.infer<typeof capabilitiesResponseSchema>;
