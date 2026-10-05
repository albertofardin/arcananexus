import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getEffectiveUserId, getUserGroupFlags } from "@/lib/authorization";
import { getMasterCampaignSlugs } from "@/lib/repositories/grant.repository";
import { capabilitiesResponseSchema } from "@/lib/validations/capabilities";
import { apiError } from "@/lib/api-helpers";

// Flag di autorizzazione trasversali per l'utente della sessione corrente
// (impersonation-aware, via `getEffectiveUserId`), usati dal gating
// client-side della navigazione (es. `SidePanel`) e dagli hook
// TanStack Query (`useCapabilities`). I Server Component possono invece usare
// direttamente gli helper di `authorization.ts`, senza passare da qui.
export async function GET(request: Request) {
  const userId = await getEffectiveUserId(request.headers);
  if (!userId) {
    return apiError(401, "Non autenticato");
  }

  // Indipendenti tra loro (`getMasterCampaignSlugs` non ha bisogno dei flag
  // di gruppo): eseguite in parallelo invece che in sequenza per risparmiare
  // un round-trip DB ad ogni caricamento della dashboard.
  const [flags, masterCampaigns] = await Promise.all([
    getUserGroupFlags(prisma, userId),
    getMasterCampaignSlugs(prisma, userId),
  ]);

  if (!flags) {
    return apiError(404, "Utente non trovato");
  }

  const response = capabilitiesResponseSchema.parse({
    isDirettivo: flags.isDirettivo,
    isSviluppo: flags.isSviluppo,
    masterCampaigns,
  });

  return NextResponse.json(response);
}
