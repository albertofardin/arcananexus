import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getEffectiveUserId } from "@/lib/authorization";
import { deleteSubscriptionForUser } from "@/lib/repositories/pushSubscription.repository";
import { pushUnsubscribeSchema } from "@/lib/validations/pushSubscription";
import { apiError } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  const userId = await getEffectiveUserId(request.headers);
  if (!userId) {
    return apiError(401, "Non autenticato");
  }

  const body = await request.json().catch(() => null);
  const parsedBody = pushUnsubscribeSchema.safeParse(body);
  if (!parsedBody.success) {
    return apiError(400, "Dati non validi", parsedBody.error.flatten());
  }

  try {
    await deleteSubscriptionForUser(prisma, {
      userId,
      endpoint: parsedBody.data.endpoint,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting push subscription:", error);
    return apiError(500, "Internal server error");
  }
}
