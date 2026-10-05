import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { profileResponseSchema } from "@/lib/validations/profile";
import { getPersonalDataByUserId } from "@/lib/repositories/personalData.repository";
import { getEmailNotificationsEnabled } from "@/lib/repositories/user.repository";
import { apiError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return apiError(401, "Not authenticated");
  }

  try {
    // Solo il proprio profilo: l'id arriva sempre dalla sessione, mai da input esterno.
    const [personalData, emailNotificationsEnabled] = await Promise.all([
      getPersonalDataByUserId(prisma, session.user.id),
      getEmailNotificationsEnabled(prisma, session.user.id),
    ]);

    const response = profileResponseSchema.parse({
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image ?? null,
        emailVerified: session.user.emailVerified,
        emailNotificationsEnabled,
      },
      personalData,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching profile:", error);
    return apiError(500, "Internal server error");
  }
}
