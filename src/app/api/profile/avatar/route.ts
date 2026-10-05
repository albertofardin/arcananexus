import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getSessionContext } from "@/lib/impersonation";
import { utapi } from "@/lib/uploadthing";
import { extractUploadThingKey } from "@/lib/avatarUpload";
import { deleteFileBestEffort } from "@/lib/uploadFile";
import { apiError } from "@/lib/api-helpers";

// L'upload dell'avatar passa dal file router UploadThing (`avatarUploader`,
// `src/app/api/uploadthing/core.ts` + `src/lib/avatarUpload.ts`): questa
// route gestisce solo la rimozione, il `POST` lato client (`AvatarUpload`,
// `src/components/AvatarUpload`) non passa più da qui.

// Rimuove l'avatar dell'utente attivo (il target durante un'impersonificazione,
// come già avviene per `name` in /api/profile/update — solo l'email vi resta
// bloccata, vedi quella route).
export async function DELETE(request: NextRequest) {
  const context = await getSessionContext(request.headers);
  if (!context) {
    return apiError(401, "Not authenticated");
  }

  try {
    const previous = await prisma.user.findUnique({
      where: { id: context.activeUser.id },
      select: { image: true },
    });

    await auth.api.updateUser({
      body: { image: null },
      headers: request.headers,
    });

    // Best-effort: un fallimento nella cleanup del file su UploadThing non
    // deve far fallire la rimozione, il campo `image` è già stato azzerato.
    const previousKey = extractUploadThingKey(previous?.image);
    if (previousKey) {
      await deleteFileBestEffort(
        fileKey => utapi.deleteFiles(fileKey),
        previousKey,
        "previous avatar file"
      );
    }

    return NextResponse.json({ url: null });
  } catch (error) {
    console.error("Error removing user avatar:", error);
    return apiError(500, "Internal server error");
  }
}
