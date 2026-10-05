import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getEventByIdScoped } from "@/lib/repositories/event.repository";
import {
  createPaidBooking,
  findPaymentByPayPalOrderId,
} from "@/lib/repositories/booking.repository";
import { getVoucherBalance } from "@/lib/repositories/voucher.repository";
import { getRegistrationState } from "@/lib/eventRegistration";
import { getCurrentAssociationYear } from "@/lib/authorization";
import { capturePayPalOrder } from "@/lib/paypal";
import { eventCaptureSchema } from "@/lib/validations/event";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ eventId: string }>;
}

// Dopo l'approvazione nel browser (pulsanti o campi carta): rivalida i
// requisiti PRIMA di catturare il pagamento, poi cattura e registra
// iscrizione + pagamento.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const eventId = Number((await params).eventId);
  if (!Number.isInteger(eventId)) return apiError(404, "Evento non trovato");

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return apiError(401, "Non autenticato");
  const userId = session.user.id;

  const parsed = eventCaptureSchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) return apiError(400, "Dati non validi");
  const { orderId } = parsed.data;
  const characterId = parsed.data.characterId ?? null;

  try {
    const event = await getEventByIdScoped(prisma, eventId, ARCANA_DOMINE_SLUG);
    if (!event || event.visibility === "hidden")
      return apiError(404, "Evento non trovato");

    // Ripetizione della richiesta: già registrato con questo ordine.
    if (await findPaymentByPayPalOrderId(prisma, orderId)) {
      return NextResponse.json({ status: "registered" });
    }

    const state = await getRegistrationState(prisma, event, userId);
    const validCharacter =
      !state.needsCharacter ||
      state.characters.some(character => character.id === characterId);
    if (!state.canRegister || !validCharacter) {
      return apiError(422, "Requisiti d'iscrizione non soddisfatti");
    }

    const { paymentOptionId } = parsed.data;
    const paymentOption =
      paymentOptionId == null
        ? null
        : event.paymentOptions.find(option => option.id === paymentOptionId);
    if (paymentOption === undefined) {
      return apiError(400, "Opzione di pagamento non valida");
    }
    const price = Number(paymentOption?.amount ?? event.price);
    const year = getCurrentAssociationYear();
    const balance = await getVoucherBalance(prisma, userId, year);

    const captured = await capturePayPalOrder(orderId);
    // L'ordine è stato creato server-side per la quota scelta meno il saldo
    // buoni (vedi `register`): la differenza fra quota e importo catturato è
    // la parte pagata con i buoni, che deve stare nel saldo disponibile. Un
    // `paymentOptionId` "falso" può solo far scegliere un'altra quota
    // coerente con quanto effettivamente pagato.
    const voucherAmount =
      Math.round((price - Number(captured.amount)) * 100) / 100;
    if (
      captured.status !== "COMPLETED" ||
      voucherAmount < 0 ||
      voucherAmount > balance + 0.001
    ) {
      return apiError(402, "Pagamento non completato");
    }

    await createPaidBooking(prisma, {
      eventId,
      userId,
      characterId: state.needsCharacter ? characterId : null,
      value: price,
      paymentData: {
        provider: "paypal",
        orderId,
        order: captured.raw as never,
        ...(voucherAmount > 0 && { voucherAmount }),
      },
      note: parsed.data.note,
      paymentOptionLabel: paymentOption?.label,
      voucher: { amount: voucherAmount, year },
    });
    return NextResponse.json({ status: "registered" });
  } catch (error) {
    // Se la cattura è riuscita ma il salvataggio no, il pagamento è su PayPal
    // ma manca la Booking: l'orderId in log permette la riconciliazione.
    console.error("Error completing PayPal registration:", orderId, error);
    return apiError(500, "Internal server error");
  }
}
