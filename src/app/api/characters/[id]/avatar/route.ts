import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { updateCharacter } from "@/lib/repositories/character.repository";
import { utapi } from "@/lib/uploadthing";
import {
  authorizeAvatarUpload,
  extractUploadThingKey,
} from "@/lib/avatarUpload";
import { deleteFileBestEffort } from "@/lib/uploadFile";
import { apiError } from "@/lib/api-helpers";

// L'upload dell'avatar passa dal file router UploadThing (`avatarUploader`,
// `src/app/api/uploadthing/core.ts` + `src/lib/avatarUpload.ts`, che
// applica lo stesso criterio di autorizzazione qui sotto): questa route
// gestisce solo la rimozione, il `POST` lato client (`AvatarUpload`,
// `src/components/AvatarUpload`) non passa più da qui.

async function authorize(request: NextRequest, characterId: number) {
  const session = await auth.api.getSession({ headers: request.headers });
  const result = await authorizeAvatarUpload(prisma, {
    userId: session?.user?.id ?? null,
    input: { target: "character", characterId },
  });

  if (result.ok === false) {
    return {
      ok: false as const,
      response: apiError(result.status, result.message),
    };
  }

  return { ok: true as const };
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const characterId = Number(id);
  if (!Number.isInteger(characterId) || characterId <= 0) {
    return apiError(400, "Id personaggio non valido");
  }

  const authResult = await authorize(request, characterId);
  if (!authResult.ok) return authResult.response;

  try {
    const previous = await prisma.character.findUnique({
      where: { id: characterId },
      select: { avatar: true },
    });

    await updateCharacter(prisma, characterId, { avatar: null });

    // Best-effort: un fallimento nella cleanup del file su UploadThing non
    // deve far fallire la rimozione, `avatar` è già stato azzerato.
    const previousKey = extractUploadThingKey(previous?.avatar);
    if (previousKey) {
      await deleteFileBestEffort(
        fileKey => utapi.deleteFiles(fileKey),
        previousKey,
        "previous avatar file"
      );
    }

    return NextResponse.json({ url: null });
  } catch (error) {
    console.error("Error removing character avatar:", error);
    return apiError(500, "Internal server error");
  }
}
