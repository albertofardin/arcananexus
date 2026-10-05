import { NextRequest, NextResponse } from "next/server";
import { NotificationType, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  characterSchema,
  updateCharacterSchema,
  CHARACTER_STAFF_ONLY_UPDATE_FIELDS,
} from "@/lib/validations/character";
import {
  deleteCharacter,
  getCharacterOwnership,
  updateCharacter,
} from "@/lib/repositories/character.repository";
import { createNotification } from "@/lib/repositories/notification.repository";
import { getUserCampaignRole, isUserCampaignMaster } from "@/lib/authorization";
import { utapi } from "@/lib/uploadthing";
import { extractUploadThingKey } from "@/lib/avatarUpload";
import { deleteFileBestEffort } from "@/lib/uploadFile";
import { apiError } from "@/lib/api-helpers";
import { getCharacterStatus } from "@/components/BadgeCharacterStatus";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return apiError(401, "Not authenticated");
  }

  const { id } = await context.params;
  const characterId = Number(id);
  if (!Number.isInteger(characterId) || characterId <= 0) {
    return apiError(400, "Id personaggio non valido");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "Dati non validi");
  }

  const validation = updateCharacterSchema.safeParse(body);
  if (!validation.success) {
    return apiError(400, "Dati non validi", validation.error);
  }

  try {
    const character = await getCharacterOwnership(prisma, characterId);
    if (!character) {
      return apiError(404, "Personaggio non trovato");
    }

    const isOwner = character.userId === session.user.id;
    const role = await getUserCampaignRole(
      prisma,
      session.user.id,
      character.campaignId
    );
    // head_master/master hanno pieni diritti su qualunque personaggio della
    // campagna; il supporter (rank più basso) li ha solo sul proprio, non su
    // quelli altrui — stessa regola di `resolveIsMaster` in
    // `characterEditor.service.ts`, qui applicata al confine di sicurezza
    // reale (questa route), non solo alla UI.
    const isStaff =
      role === Role.master ||
      role === Role.head_master ||
      (role === Role.supporter && isOwner);

    if (!isOwner && !isStaff) {
      return apiError(403, "Permessi insufficienti");
    }

    const staffOnlyFields = CHARACTER_STAFF_ONLY_UPDATE_FIELDS.filter(
      field => field in validation.data
    );
    if (!isStaff && staffOnlyFields.length > 0) {
      return apiError(
        403,
        "Permessi insufficienti",
        `Campi riservati allo staff della campagna: ${staffOnlyFields.join(", ")}`
      );
    }

    // Calcolato PRIMA dell'update (sui campi letti da `getCharacterOwnership`):
    // serve a rilevare, DOPO la scrittura, se lo status derivato è davvero
    // cambiato — stesso schema di `updateDowntimeStatus` in
    // `downtime.repository.ts`.
    const previousStatus = getCharacterStatus(character);

    const updated = await prisma.$transaction(async tx => {
      const result = await updateCharacter(tx, characterId, validation.data);

      const newStatus = getCharacterStatus(result);
      if (newStatus !== previousStatus) {
        await createNotification(tx, {
          userId: result.userId,
          campaignId: character.campaignId,
          type: NotificationType.character_status,
          entityId: characterId,
        });
      }

      return result;
    });

    const response = characterSchema.parse({
      ...updated,
      background: updated.background ?? "",
      campaignName: updated.campaign.name,
      campaignSlug: updated.campaign.slug,
      orgSlug: updated.campaign.organization.slug,
      userName: updated.user.name,
    });

    return NextResponse.json(response);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return apiError(404, "Personaggio non trovato");
    }
    console.error("Error updating character:", error);
    return apiError(500, "Internal server error");
  }
}

// Eliminazione definitiva (irreversibile): solo master/head_master della
// campagna del personaggio — nemmeno il proprietario può eliminare il proprio.
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return apiError(401, "Not authenticated");
  }

  const { id } = await context.params;
  const characterId = Number(id);
  if (!Number.isInteger(characterId) || characterId <= 0) {
    return apiError(400, "Id personaggio non valido");
  }

  try {
    const character = await getCharacterOwnership(prisma, characterId);
    if (!character) {
      return apiError(404, "Personaggio non trovato");
    }

    const allowed = await isUserCampaignMaster(
      prisma,
      session.user.id,
      character.campaignId
    );
    if (!allowed) {
      return apiError(403, "Permessi insufficienti");
    }

    await deleteCharacter(prisma, characterId);

    // Best-effort: il personaggio è già cancellato, un errore di cleanup
    // dell'avatar su UploadThing non deve far fallire la richiesta.
    const avatarKey = extractUploadThingKey(character.avatar);
    if (avatarKey) {
      await deleteFileBestEffort(
        fileKey => utapi.deleteFiles(fileKey),
        avatarKey,
        "character avatar file"
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return apiError(404, "Personaggio non trovato");
    }
    console.error("Error deleting character:", error);
    return apiError(500, "Internal server error");
  }
}
