import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getEventByIdScoped } from "@/lib/repositories/event.repository";
import {
  createFreeBooking,
  createPaidBooking,
  getBookingForUser,
} from "@/lib/repositories/booking.repository";
import {
  bookingRefund,
  cancelBookingWithRefund,
  getVoucherBalance,
  InsufficientVoucherBalanceError,
  voucherCoverage,
} from "@/lib/repositories/voucher.repository";
import { getCurrentAssociationYear } from "@/lib/authorization";
import { getRegistrationState } from "@/lib/eventRegistration";
import { createPayPalOrder, isPayPalConfigured } from "@/lib/paypal";
import { eventRegisterSchema } from "@/lib/validations/event";
import { apiError } from "@/lib/api-helpers";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

interface RouteContext {
  params: Promise<{ eventId: string }>;
}

// Iscrizione dell'utente di sessione a un evento. Evento gratuito: iscrizione
// immediata. A pagamento: crea l'ordine PayPal e ne restituisce l'id, che il
// browser approva con l'SDK (l'iscrizione avviene alla cattura, vedi
// `paypal/capture`). Il saldo buoni viene scalato per primo: se copre tutta
// la quota l'iscrizione è immediata, altrimenti PayPal incassa solo la
// differenza.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const eventId = Number((await params).eventId);
  if (!Number.isInteger(eventId)) return apiError(404, "Evento non trovato");

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return apiError(401, "Non autenticato");
  const userId = session.user.id;

  const parsed = eventRegisterSchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) return apiError(400, "Dati non validi");

  try {
    const event = await getEventByIdScoped(prisma, eventId, ARCANA_DOMINE_SLUG);
    if (!event || event.visibility === "hidden")
      return apiError(404, "Evento non trovato");

    const state = await getRegistrationState(prisma, event, userId);
    if (state.existingBooking) {
      return apiError(409, "Sei già iscritto a questo evento", {
        characterName: state.existingBooking.characterName,
      });
    }
    if (!state.canRegister) {
      return apiError(422, "Requisiti d'iscrizione non soddisfatti", state);
    }

    let characterId: number | null = null;
    if (state.needsCharacter) {
      // Con un solo personaggio attivo la scelta è implicita.
      characterId =
        parsed.data.characterId ??
        (state.characters.length === 1 ? state.characters[0].id : null);
      if (!state.characters.some(character => character.id === characterId)) {
        return apiError(400, "Seleziona il personaggio da iscrivere");
      }
    }

    let paymentOption = null;
    if (parsed.data.paymentOptionId != null) {
      paymentOption =
        event.paymentOptions.find(
          option => option.id === parsed.data.paymentOptionId
        ) ?? null;
      if (!paymentOption) {
        return apiError(400, "Opzione di pagamento non valida");
      }
    }

    const price = Number(paymentOption?.amount ?? event.price);
    if (price <= 0) {
      await createFreeBooking(prisma, {
        eventId,
        userId,
        characterId,
        note: parsed.data.note,
        paymentOptionLabel: paymentOption?.label,
      });
      return NextResponse.json({ status: "registered" }, { status: 201 });
    }

    const year = getCurrentAssociationYear();
    const voucherAmount = voucherCoverage(
      price,
      await getVoucherBalance(prisma, userId, year)
    );
    const toPay = Math.round((price - voucherAmount) * 100) / 100;
    if (toPay <= 0) {
      await createPaidBooking(prisma, {
        eventId,
        userId,
        characterId,
        value: price,
        paymentData: { provider: "voucher", voucherAmount },
        note: parsed.data.note,
        paymentOptionLabel: paymentOption?.label,
        voucher: { amount: voucherAmount, year },
      });
      return NextResponse.json({ status: "registered" }, { status: 201 });
    }

    if (!isPayPalConfigured()) {
      return apiError(503, "Pagamenti non configurati");
    }

    const order = await createPayPalOrder({
      amount: toPay.toFixed(2),
      description: paymentOption
        ? `Iscrizione a ${event.name} (${paymentOption.label})`
        : `Iscrizione a ${event.name}`,
      customId: `event:${eventId};user:${userId}`,
      method: parsed.data.method ?? "paypal",
    });

    return NextResponse.json({ status: "payment", orderId: order.id });
  } catch (error) {
    if (error instanceof InsufficientVoucherBalanceError) {
      return apiError(409, "Il saldo buoni è cambiato, riprova");
    }
    console.error("Error registering to event:", error);
    return apiError(500, "Internal server error");
  }
}

// Disiscrizione dell'utente di sessione, possibile fino all'inizio
// dell'evento: la quota pagata torna come saldo buoni dell'anno corrente.
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const eventId = Number((await params).eventId);
  if (!Number.isInteger(eventId)) return apiError(404, "Evento non trovato");

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return apiError(401, "Non autenticato");
  const userId = session.user.id;

  try {
    const event = await getEventByIdScoped(prisma, eventId, ARCANA_DOMINE_SLUG);
    if (!event) return apiError(404, "Evento non trovato");

    const booking = await getBookingForUser(prisma, eventId, userId);
    if (!booking) return apiError(404, "Non sei iscritto a questo evento");
    if (new Date() >= event.dateEventStart) {
      return apiError(422, "L'evento è già iniziato");
    }

    const refund = bookingRefund(booking);
    await cancelBookingWithRefund(prisma, {
      bookingId: booking.id,
      userId,
      eventId,
      year: getCurrentAssociationYear(),
      refund,
    });
    return NextResponse.json({ status: "cancelled", refund });
  } catch (error) {
    console.error("Error cancelling event booking:", error);
    return apiError(500, "Internal server error");
  }
}
