import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  getCurrentAssociationYear,
  hasValidMembershipForYear,
} from "@/lib/authorization";
import { getPersonalDataByUserId } from "@/lib/repositories/personalData.repository";
import { isPersonalDataComplete } from "@/lib/validations/profile";
import { createPayPalOrder, isPayPalConfigured } from "@/lib/paypal";
import { membershipRegisterSchema } from "@/lib/validations/membership";
import { apiError } from "@/lib/api-helpers";
import { MEMBERSHIP_FEE } from "@/lib/constants";

// Avvio del pagamento della tessera associativa annuale (quota fissa, T-051):
// crea l'ordine PayPal, che il browser approva con l'SDK (la tessera viene
// creata alla cattura, vedi `paypal/capture`). Mirror di
// `events/[eventId]/register`, senza scelta di personaggio/quota.
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return apiError(401, "Non autenticato");
  const userId = session.user.id;

  const parsed = membershipRegisterSchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) return apiError(400, "Dati non validi");

  try {
    const year = getCurrentAssociationYear();
    if (await hasValidMembershipForYear(prisma, userId, year)) {
      return apiError(409, `Hai già una tessera associativa per il ${year}`);
    }

    const personalData = await getPersonalDataByUserId(prisma, userId);
    if (!isPersonalDataComplete(personalData)) {
      return apiError(422, "Completa l'anagrafica prima di pagare la tessera");
    }

    if (!isPayPalConfigured()) {
      return apiError(503, "Pagamenti non configurati");
    }

    const order = await createPayPalOrder({
      amount: MEMBERSHIP_FEE.toFixed(2),
      description: `Tessera associativa ${year}`,
      customId: `membership:${year};user:${userId}`,
      method: parsed.data.method ?? "paypal",
    });

    return NextResponse.json({ status: "payment", orderId: order.id });
  } catch (error) {
    console.error("Error registering membership payment:", error);
    return apiError(500, "Internal server error");
  }
}
