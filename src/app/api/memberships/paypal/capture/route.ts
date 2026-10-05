import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  getCurrentAssociationYear,
  hasValidMembershipForYear,
} from "@/lib/authorization";
import { getPersonalDataByUserId } from "@/lib/repositories/personalData.repository";
import { isPersonalDataComplete } from "@/lib/validations/profile";
import { createPaidMembership } from "@/lib/repositories/membership.repository";
import { findPaymentByPayPalOrderId } from "@/lib/repositories/booking.repository";
import { capturePayPalOrder } from "@/lib/paypal";
import { membershipCaptureSchema } from "@/lib/validations/membership";
import { apiError } from "@/lib/api-helpers";
import { MEMBERSHIP_FEE } from "@/lib/constants";

// Dopo l'approvazione nel browser: rivalida i requisiti PRIMA di catturare
// il pagamento, poi cattura e registra tessera + pagamento. Mirror di
// `events/[eventId]/paypal/capture`.
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return apiError(401, "Non autenticato");
  const userId = session.user.id;

  const parsed = membershipCaptureSchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) return apiError(400, "Dati non validi");
  const { orderId } = parsed.data;

  try {
    // Ripetizione della richiesta: già registrata con questo ordine.
    if (await findPaymentByPayPalOrderId(prisma, orderId)) {
      return NextResponse.json({ status: "registered" });
    }

    const year = getCurrentAssociationYear();
    if (await hasValidMembershipForYear(prisma, userId, year)) {
      return apiError(409, `Hai già una tessera associativa per il ${year}`);
    }

    const personalData = await getPersonalDataByUserId(prisma, userId);
    if (!isPersonalDataComplete(personalData)) {
      return apiError(422, "Completa l'anagrafica prima di pagare la tessera");
    }

    const captured = await capturePayPalOrder(orderId);
    const capturedAmount = Number(captured.amount);
    const isAllowedAmount = Math.abs(capturedAmount - MEMBERSHIP_FEE) < 0.01;
    if (captured.status !== "COMPLETED" || !isAllowedAmount) {
      return apiError(402, "Pagamento non completato");
    }

    await createPaidMembership(prisma, {
      userId,
      year,
      value: capturedAmount,
      paymentData: {
        provider: "paypal",
        orderId,
        order: captured.raw as never,
      },
    });
    return NextResponse.json({ status: "registered" });
  } catch (error) {
    // Se la cattura è riuscita ma il salvataggio no, il pagamento è su PayPal
    // ma manca la Membership: l'orderId in log permette la riconciliazione.
    console.error(
      "Error completing PayPal membership payment:",
      orderId,
      error
    );
    return apiError(500, "Internal server error");
  }
}
