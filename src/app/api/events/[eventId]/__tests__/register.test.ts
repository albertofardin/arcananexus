import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { POST, DELETE } from "../register/route";
import { POST as paypalCapture } from "../paypal/capture/route";
import { auth } from "@/lib/auth";
import { getEventByIdScoped } from "@/lib/repositories/event.repository";
import {
  createFreeBooking,
  createPaidBooking,
  findPaymentByPayPalOrderId,
  getBookingForUser,
} from "@/lib/repositories/booking.repository";
import {
  cancelBookingWithRefund,
  getVoucherBalance,
} from "@/lib/repositories/voucher.repository";
import { getRegistrationState } from "@/lib/eventRegistration";
import { createPayPalOrder, capturePayPalOrder } from "@/lib/paypal";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/repositories/event.repository");
vi.mock("@/lib/repositories/booking.repository");
vi.mock("@/lib/eventRegistration");
vi.mock("@/lib/repositories/voucher.repository", async importOriginal => ({
  ...(await importOriginal<
    typeof import("@/lib/repositories/voucher.repository")
  >()),
  getVoucherBalance: vi.fn(),
  cancelBookingWithRefund: vi.fn(),
}));
vi.mock("@/lib/paypal", () => ({
  isPayPalConfigured: () => true,
  createPayPalOrder: vi.fn(),
  capturePayPalOrder: vi.fn(),
}));

const ctx = { params: Promise.resolve({ eventId: "7" }) };
const event = (price: number) => ({
  id: 7,
  name: "Piscinata",
  campaignId: null,
  campaign: null,
  visibility: "visible",
  price,
  paymentOptions: [],
});
const readyState = {
  existingBooking: null,
  canRegister: true,
  needsCharacter: false,
  characters: [],
};
const post = (body: object = {}) =>
  POST(
    new NextRequest("http://localhost/api/events/7/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    ctx
  );

describe("POST /api/events/[eventId]/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "u1" },
    });
    (getEventByIdScoped as Mock).mockResolvedValue(event(0));
    (getRegistrationState as Mock).mockResolvedValue(readyState);
    (getVoucherBalance as Mock).mockResolvedValue(0);
  });

  it("401 senza sessione", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);
    expect((await post()).status).toBe(401);
  });

  it("404 se l'evento è nascosto", async () => {
    (getEventByIdScoped as Mock).mockResolvedValue({
      ...event(0),
      visibility: "hidden",
    });
    expect((await post()).status).toBe(404);
  });

  it("409 se già iscritto, indicando il personaggio", async () => {
    (getRegistrationState as Mock).mockResolvedValue({
      ...readyState,
      existingBooking: { characterName: "Gandalf" },
    });

    const response = await post();

    expect(response.status).toBe(409);
    expect((await response.json()).details.characterName).toBe("Gandalf");
    expect(createFreeBooking).not.toHaveBeenCalled();
  });

  it("422 se i requisiti non sono soddisfatti", async () => {
    (getRegistrationState as Mock).mockResolvedValue({
      ...readyState,
      canRegister: false,
    });
    expect((await post()).status).toBe(422);
  });

  it("evento gratuito: iscrive subito senza PayPal", async () => {
    const response = await post();

    expect(response.status).toBe(201);
    expect(createFreeBooking).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventId: 7, userId: "u1", characterId: null })
    );
    expect(createPayPalOrder).not.toHaveBeenCalled();
  });

  it("passa la nota opzionale alla booking", async () => {
    await post({ note: "  solo gluten free  " });

    expect(createFreeBooking).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ note: "solo gluten free" })
    );
  });

  it("evento di campagna: rifiuta un personaggio non tra quelli attivi", async () => {
    (getRegistrationState as Mock).mockResolvedValue({
      ...readyState,
      needsCharacter: true,
      characters: [
        { id: 1, name: "A" },
        { id: 2, name: "B" },
      ],
    });

    expect((await post({ characterId: 99 })).status).toBe(400);
    expect((await post()).status).toBe(400); // più PG: serve la scelta
    expect((await post({ characterId: 2 })).status).toBe(201);
  });

  it("evento a pagamento: crea l'ordine PayPal, non la booking", async () => {
    (getEventByIdScoped as Mock).mockResolvedValue(event(12.5));
    (createPayPalOrder as Mock).mockResolvedValue({ id: "ORD1" });

    const response = await post({ method: "card" });

    expect((await response.json()).orderId).toBe("ORD1");
    expect(createPayPalOrder).toHaveBeenCalledWith(
      expect.objectContaining({ amount: "12.50", method: "card" })
    );
    expect(createFreeBooking).not.toHaveBeenCalled();
  });

  it("saldo buoni parziale: PayPal incassa solo la differenza", async () => {
    (getEventByIdScoped as Mock).mockResolvedValue(event(45));
    (getVoucherBalance as Mock).mockResolvedValue(10);
    (createPayPalOrder as Mock).mockResolvedValue({ id: "ORD1" });

    await post({ method: "paypal" });

    expect(createPayPalOrder).toHaveBeenCalledWith(
      expect.objectContaining({ amount: "35.00" })
    );
    expect(createPaidBooking).not.toHaveBeenCalled();
  });

  it("saldo buoni che copre la quota: iscrive senza PayPal, quota intera sul pagamento", async () => {
    (getEventByIdScoped as Mock).mockResolvedValue(event(45));
    (getVoucherBalance as Mock).mockResolvedValue(60);

    const response = await post();

    expect(response.status).toBe(201);
    expect(createPayPalOrder).not.toHaveBeenCalled();
    expect(createPaidBooking).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        value: 45,
        voucher: expect.objectContaining({ amount: 45 }),
      })
    );
  });
});

describe("POST /api/events/[eventId]/paypal/capture", () => {
  const ret = (body: object = { orderId: "ORD1" }) =>
    paypalCapture(
      new NextRequest("http://localhost/api/events/7/paypal/capture", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      ctx
    );

  beforeEach(() => {
    vi.clearAllMocks();
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "u1" },
    });
    (getEventByIdScoped as Mock).mockResolvedValue(event(12.5));
    (getRegistrationState as Mock).mockResolvedValue(readyState);
    (getVoucherBalance as Mock).mockResolvedValue(0);
    (findPaymentByPayPalOrderId as Mock).mockResolvedValue(null);
    (capturePayPalOrder as Mock).mockResolvedValue({
      status: "COMPLETED",
      amount: "12.50",
      raw: {},
    });
  });

  it("cattura e registra pagamento + iscrizione", async () => {
    const response = await ret();

    expect(response.status).toBe(200);
    expect(createPaidBooking).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventId: 7, userId: "u1", value: 12.5 })
    );
  });

  it("idempotente: stesso ordine già registrato non ricatura", async () => {
    (findPaymentByPayPalOrderId as Mock).mockResolvedValue({ id: 1 });

    const response = await ret();

    expect(response.status).toBe(200);
    expect(capturePayPalOrder).not.toHaveBeenCalled();
    expect(createPaidBooking).not.toHaveBeenCalled();
  });

  it("requisiti non più validi: non cattura il pagamento", async () => {
    (getRegistrationState as Mock).mockResolvedValue({
      ...readyState,
      canRegister: false,
    });

    const response = await ret();

    expect(response.status).toBe(422);
    expect(capturePayPalOrder).not.toHaveBeenCalled();
  });

  it("importo catturato inferiore al prezzo: nessuna iscrizione", async () => {
    (capturePayPalOrder as Mock).mockResolvedValue({
      status: "COMPLETED",
      amount: "1.00",
      raw: {},
    });

    const response = await ret();

    expect(response.status).toBe(402);
    expect(createPaidBooking).not.toHaveBeenCalled();
  });

  it("differenza coperta dal saldo buoni: registra la quota intera e scala i buoni", async () => {
    (getVoucherBalance as Mock).mockResolvedValue(10);
    (capturePayPalOrder as Mock).mockResolvedValue({
      status: "COMPLETED",
      amount: "2.50",
      raw: {},
    });

    const response = await ret();

    expect(response.status).toBe(200);
    expect(createPaidBooking).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        value: 12.5,
        voucher: expect.objectContaining({ amount: 10 }),
      })
    );
  });
});

describe("DELETE /api/events/[eventId]/register", () => {
  const del = () =>
    DELETE(
      new NextRequest("http://localhost/api/events/7/register", {
        method: "DELETE",
      }),
      ctx
    );
  const future = new Date(Date.now() + 86_400_000);

  beforeEach(() => {
    vi.clearAllMocks();
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "u1" },
    });
    (getEventByIdScoped as Mock).mockResolvedValue({
      ...event(45),
      dateEventStart: future,
    });
  });

  it("iscrizione pagata: rimborsa l'intera quota in buoni", async () => {
    (getBookingForUser as Mock).mockResolvedValue({
      id: 3,
      addedByStaff: false,
      payment: { value: 45 },
    });

    const response = await del();

    expect(response.status).toBe(200);
    expect(cancelBookingWithRefund).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ bookingId: 3, userId: "u1", refund: 45 })
    );
  });

  it("iscritto gratis dallo staff: nessun rimborso", async () => {
    (getBookingForUser as Mock).mockResolvedValue({
      id: 3,
      addedByStaff: true,
      payment: null,
    });

    await del();

    expect(cancelBookingWithRefund).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ refund: 0 })
    );
  });

  it("evento già iniziato: 422", async () => {
    (getEventByIdScoped as Mock).mockResolvedValue({
      ...event(45),
      dateEventStart: new Date(Date.now() - 1000),
    });
    (getBookingForUser as Mock).mockResolvedValue({
      id: 3,
      addedByStaff: false,
      payment: { value: 45 },
    });

    expect((await del()).status).toBe(422);
    expect(cancelBookingWithRefund).not.toHaveBeenCalled();
  });

  it("non iscritto: 404", async () => {
    (getBookingForUser as Mock).mockResolvedValue(null);
    expect((await del()).status).toBe(404);
  });
});
