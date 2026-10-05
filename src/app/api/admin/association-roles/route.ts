import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdminSectionAccess } from "@/lib/authorization";
import { listCampaignsWithGrants } from "@/lib/repositories/campaign.repository";
import {
  listAllUsersBasic,
  listDirettivoMembers,
  listSviluppoMembers,
  setUserDirettivo,
  setUserSviluppo,
} from "@/lib/repositories/user.repository";
import {
  assignGroupSchema,
  rolesOverviewResponseSchema,
} from "@/lib/validations/adminGroups";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

// Vista d'insieme per la gestione ruoli a livello organizzazione: tutte le
// campagne con le loro assegnazioni staff, l'elenco utenti e i membri
// attuali dei due gruppi flat "Direttivo" e "Sviluppo Web". Riservato a chi
// ha accesso alla sezione Amministrazione (`isDirettivo` o `isSviluppo`): le
// campagne sono visibili a entrambi, ma editabili solo da Sviluppo Web (il
// gating fine dell'editing è sulle route `/api/campaigns/[slug]/grants*`,
// via `requireCampaignAdminBySlugOrSviluppo` — qui la lettura non richiede
// bypass, essendo già dietro `requireAdminSectionAccess`).
export const GET = requireAdminSectionAccess(async () => {
  try {
    const [campaigns, users, direttivoMembers, sviluppoMembers] =
      await Promise.all([
        listCampaignsWithGrants(prisma, ARCANA_DOMINE_SLUG),
        listAllUsersBasic(prisma),
        listDirettivoMembers(prisma),
        listSviluppoMembers(prisma),
      ]);

    const response = rolesOverviewResponseSchema.parse({
      campaigns: campaigns.map(c => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        assignments: c.grants.map(g => ({ userId: g.userId, role: g.role })),
      })),
      users,
      direttivoMemberIds: direttivoMembers.map(u => u.id),
      sviluppoMemberIds: sviluppoMembers.map(u => u.id),
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching roles overview:", error);
    return apiError(500, "Internal server error");
  }
});

// Aggiunge un utente già registrato a uno dei due gruppi flat. Chiunque abbia
// accesso alla sezione Amministrazione può gestire il gruppo "Direttivo", ma
// SOLO chi è effettivamente Sviluppo Web (`info.isSviluppo`) può gestire il
// gruppo "Sviluppo Web" — altrimenti un utente solo-direttivo potrebbe
// auto-promuoversi a Sviluppo Web, che dà accesso all'impersonation.
export const POST = requireAdminSectionAccess(async (request, _ctx, info) => {
  try {
    const body = await request.json().catch(() => null);
    const parsed = assignGroupSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "Dati non validi", parsed.error.flatten());
    }

    const { userId, group } = parsed.data;

    if (group === "sviluppo" && !info.isSviluppo) {
      return apiError(403, "Solo Sviluppo Web può gestire questo gruppo");
    }

    const user =
      group === "direttivo"
        ? await setUserDirettivo(prisma, userId, true)
        : await setUserSviluppo(prisma, userId, true);

    return NextResponse.json(
      {
        userId: user.id,
        group,
        isDirettivo: user.isDirettivo,
        isSviluppo: user.isSviluppo,
      },
      { status: 201 }
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return apiError(404, "Utente non trovato");
    }
    console.error("Error assigning admin group:", error);
    return apiError(500, "Internal server error");
  }
});
