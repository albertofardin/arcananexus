import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  requireAdminSectionAccess,
  isHardcodedSviluppo,
} from "@/lib/authorization";
import {
  setUserDirettivo,
  setUserSviluppo,
  getUserEmailById,
} from "@/lib/repositories/user.repository";
import { adminGroupEnum } from "@/lib/validations/adminGroups";
import { apiError } from "@/lib/api-helpers";

interface RouteContext {
  params: Promise<{ userId: string }>;
}

// Rimuove un utente da uno dei due gruppi flat (`?group=direttivo|sviluppo`).
// Stessa asimmetria di permessi del POST: solo Sviluppo Web può rimuovere
// membri da "Sviluppo Web"; le due email cablate non sono mai rimovibili da
// quel gruppo, nemmeno da un utente Sviluppo Web.
export const DELETE = requireAdminSectionAccess(
  async (request: Request, { params }: RouteContext, info) => {
    const { userId } = await params;

    const { searchParams } = new URL(request.url);
    const parsedGroup = adminGroupEnum.safeParse(searchParams.get("group"));
    if (!parsedGroup.success) {
      return apiError(400, "Parametro group mancante o non valido");
    }
    const group = parsedGroup.data;

    if (group === "sviluppo") {
      if (!info.isSviluppo) {
        return apiError(403, "Solo Sviluppo Web può gestire questo gruppo");
      }
      const targetEmail = await getUserEmailById(prisma, userId);
      if (targetEmail && isHardcodedSviluppo(targetEmail)) {
        return apiError(
          403,
          "Questo utente non può essere rimosso da Sviluppo Web"
        );
      }
    }

    try {
      if (group === "direttivo") {
        await setUserDirettivo(prisma, userId, false);
      } else {
        await setUserSviluppo(prisma, userId, false);
      }
      return new NextResponse(null, { status: 204 });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        return apiError(404, "Utente non trovato");
      }
      console.error("Error removing admin group:", error);
      return apiError(500, "Internal server error");
    }
  }
);
