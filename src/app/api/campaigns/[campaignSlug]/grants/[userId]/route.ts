import { NextRequest, NextResponse } from "next/server";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCampaignAdminBySlugOrSviluppo } from "@/lib/authorization";
import {
  getGrant,
  updateGrantRole,
  revokeGrant,
  countHeadMastersForCampaign,
} from "@/lib/repositories/grant.repository";
import { updateGrantRoleSchema } from "@/lib/validations/grant";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string; userId: string }>;
}

// Cambia il ruolo di uno staffer già assegnato alla campagna. Riservato
// all'head master della campagna o a Sviluppo Web (vedi
// `requireCampaignAdminBySlugOrSviluppo`, usata dalla vista "god view" di
// Amministrazione > Gestione Ruoli); deve sempre restare almeno un head
// master nella campagna, salvo deroga per Sviluppo Web (T-1).
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug, userId } = await params;

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
    const parsed = updateGrantRoleSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "Dati non validi", parsed.error.flatten());
    }

    const currentGrant = await getGrant(prisma, userId, access.campaign.id);
    if (!currentGrant) {
      return apiError(404, "Assegnazione non trovata");
    }

    const targetIsHeadMaster = currentGrant.role === Role.head_master;
    const nextIsHeadMaster = parsed.data.role === Role.head_master;

    if (targetIsHeadMaster && !nextIsHeadMaster && !access.isSviluppo) {
      const headMasterCount = await countHeadMastersForCampaign(
        prisma,
        access.campaign.id
      );
      if (headMasterCount <= 1) {
        return apiError(
          409,
          "Deve rimanere sempre almeno un head master nella campagna"
        );
      }
    }

    const grant = await updateGrantRole(
      prisma,
      userId,
      access.campaign.id,
      parsed.data.role
    );

    return NextResponse.json({ userId: grant.userId, role: grant.role });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return apiError(404, "Assegnazione non trovata");
    }
    console.error("Error updating campaign grant:", error);
    return apiError(500, "Internal server error");
  }
}

// Rimuove uno staffer dalla campagna. Riservato all'head master della
// campagna o a Sviluppo Web (vedi `requireCampaignAdminBySlugOrSviluppo`);
// deve sempre restare almeno un head master nella campagna, salvo deroga per
// Sviluppo Web (T-1).
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { campaignSlug, userId } = await params;

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

    const currentGrant = await getGrant(prisma, userId, access.campaign.id);
    if (!currentGrant) {
      return apiError(404, "Assegnazione non trovata");
    }

    const targetIsHeadMaster = currentGrant.role === Role.head_master;

    if (targetIsHeadMaster && !access.isSviluppo) {
      const headMasterCount = await countHeadMastersForCampaign(
        prisma,
        access.campaign.id
      );
      if (headMasterCount <= 1) {
        return apiError(
          409,
          "Deve rimanere sempre almeno un head master nella campagna"
        );
      }
    }

    await revokeGrant(prisma, userId, access.campaign.id);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return apiError(404, "Assegnazione non trovata");
    }
    console.error("Error revoking campaign grant:", error);
    return apiError(500, "Internal server error");
  }
}
