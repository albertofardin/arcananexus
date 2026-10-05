import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  requireCampaignAdminBySlugOrSviluppo,
  requireCampaignSupporterBySlug,
} from "@/lib/authorization";
import {
  createGrant,
  listGrantsForCampaign,
} from "@/lib/repositories/grant.repository";
import { listAllUsersBasic } from "@/lib/repositories/user.repository";
import {
  createGrantSchema,
  campaignGrantsResponseSchema,
} from "@/lib/validations/grant";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string }>;
}

// Elenca le assegnazioni di ruolo staff della campagna e gli utenti
// registrati disponibili per l'aggiunta. Riservato a qualunque membro dello
// staff della campagna (supporter+) o super-admin: la sola lettura è
// consentita anche a chi non può modificare le assegnazioni (T-1).
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug } = await params;

  try {
    const access = await requireCampaignSupporterBySlug(
      prisma,
      request.headers,
      campaignSlug,
      ARCANA_DOMINE_SLUG
    );
    if (access.ok === false) {
      return apiError(access.status, access.error);
    }

    const [grants, users] = await Promise.all([
      listGrantsForCampaign(prisma, access.campaign.id),
      listAllUsersBasic(prisma),
    ]);

    const response = campaignGrantsResponseSchema.parse({
      campaign: {
        id: access.campaign.id,
        name: access.campaign.name,
        slug: access.campaign.slug,
      },
      assignments: grants.map(g => ({ userId: g.userId, role: g.role })),
      users,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching campaign grants:", error);
    return apiError(500, "Internal server error");
  }
}

// Assegna un utente già registrato alla campagna con un ruolo. Riservato
// all'head master della campagna o a Sviluppo Web (vedi
// `requireCampaignAdminBySlugOrSviluppo`, usata dalla vista "god view" di
// Amministrazione > Gestione Ruoli): master e supporter hanno accesso di
// sola lettura (vedi GET sopra), nessun altro editing consentito.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug } = await params;

  try {
    const access = await requireCampaignAdminBySlugOrSviluppo(
      prisma,
      request.headers,
      campaignSlug,
      ARCANA_DOMINE_SLUG
    );
    if (access.ok === false) {
      return apiError(access.status, access.error);
    }

    const body = await request.json().catch(() => null);
    const parsed = createGrantSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "Dati non validi", parsed.error.flatten());
    }

    const grant = await createGrant(prisma, {
      userId: parsed.data.userId,
      campaignId: access.campaign.id,
      role: parsed.data.role,
    });

    return NextResponse.json(
      { userId: grant.userId, role: grant.role },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return apiError(
          409,
          "L'utente ha già un ruolo assegnato a questa campagna"
        );
      }
      if (error.code === "P2003") {
        return apiError(400, "Utente non valido");
      }
    }
    console.error("Error creating campaign grant:", error);
    return apiError(500, "Internal server error");
  }
}
