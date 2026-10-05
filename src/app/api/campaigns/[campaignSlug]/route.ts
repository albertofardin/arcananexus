import { NextRequest, NextResponse, after } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { updateCampaignSchema } from "@/lib/validations/campaign";
import {
  getCampaignBySlug,
  updateCampaign,
  deleteCampaign,
  getCampaignUploadThingRefs,
} from "@/lib/repositories/campaign.repository";
import { cleanupCampaignFiles } from "@/lib/campaignFileCleanup";
import { isUserCampaignAdmin } from "@/lib/authorization";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ campaignSlug: string }>;
}

async function resolveCampaign(context: RouteContext) {
  const { campaignSlug } = await context.params;
  return getCampaignBySlug(prisma, campaignSlug, ARCANA_DOMINE_SLUG);
}

// Modificare/eliminare una campagna esistente richiede l'head_master di
// quella specifica campagna.
async function canManageCampaign(userId: string, campaignId: number) {
  return isUserCampaignAdmin(prisma, userId, campaignId);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return apiError(401, "Non autenticato");
  }

  const existing = await resolveCampaign(context);
  if (!existing) {
    return apiError(404, "Campagna non trovata");
  }

  const allowed = await canManageCampaign(session.user.id, existing.id);
  if (!allowed) {
    return apiError(403, "Permessi insufficienti");
  }

  const body = await request.json().catch(() => null);
  const parsed = updateCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "Dati non validi", parsed.error.flatten());
  }

  try {
    const updated = await updateCampaign(prisma, existing.id, parsed.data);
    return NextResponse.json(updated);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return apiError(
        409,
        "Esiste già una campagna con questo slug in questa organizzazione"
      );
    }
    console.error("Error updating campaign:", error);
    return apiError(500, "Internal server error");
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return apiError(401, "Non autenticato");
  }

  const existing = await resolveCampaign(context);
  if (!existing) {
    return apiError(404, "Campagna non trovata");
  }

  const allowed = await canManageCampaign(session.user.id, existing.id);
  if (!allowed) {
    return apiError(403, "Permessi insufficienti");
  }

  try {
    const fileRefs = await getCampaignUploadThingRefs(prisma, existing.id);
    await deleteCampaign(prisma, existing.id);

    // Pulizia dei file UploadThing orfani (logo, copertina, galleria,
    // documenti reference-data, avatar personaggi, immagini incorporate nei
    // campi rich-text di reference-data/missive/downtime) in background: un
    // bulk delete su molti file può richiedere tempo e non deve ritardare la
    // risposta al client, che non deve nemmeno aspettarla — gira dopo
    // l'invio della response (`after`), il suo esito non cambia quello della
    // DELETE (la campagna è comunque già cancellata dal DB).
    after(() => cleanupCampaignFiles(fileRefs, existing.slug));

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting campaign:", error);
    return apiError(500, "Internal server error");
  }
}
