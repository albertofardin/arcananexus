import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../register/route";
import { POST as paypalCapture } from "../paypal/capture/route";
import { auth } from "@/lib/auth";
import {
  getCurrentAssociationYear,
  hasValidMembershipForYear,
} from "@/lib/authorization";
import { getPersonalDataByUserId } from "@/lib/repositories/personalData.repository";
import { isPersonalDataComplete } from "@/lib/validations/profile";
import { createPaidMembership } from "@/lib/repositories/membership.repository";
import { findPaymentByPayPalOrderId } from "@/lib/repositories/booking.repository";
import { createPayPalOrder, capturePayPalOrder } from "@/lib/paypal";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/authorization");
vi.mock("@/lib/repositories/personalData.repository");
vi.mock("@/lib/validations/profile", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/validations/profile")>()),
  isPersonalDataComplete: vi.fn(),
}));
vi.mock("@/lib/repositories/membership.repository");
vi.mock("@/lib/repositories/booking.repository");
vi.mock("@/lib/paypal", () => ({
  isPayPalConfigured: () => true,
  createPayPalOrder: vi.fn(),
  capturePayPalOrder: vi.fn(),
}));

const post = (body: object = {}) =>
  POST(
    new NextRequest("http://localhost/api/memberships/register", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );

describe("POST /api/memberships/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "u1" },
    });
    (getCurrentAssociationYear as Mock).mockReturnValue(2026);
    (hasValidMembershipForYear as Mock).mockResolvedValue(false);
    (getPersonalDataByUserId as Mock).mockResolvedValue({});
    (isPersonalDataComplete as Mock).mockReturnValue(true);
  });

  it("401 senza sessione", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);
    expect((await post()).status).toBe(401);
  });

  it("409 se la tessera dell'anno corrente esiste già", async () => {
    (hasValidMembershipForYear as Mock).mockResolvedValue(true);

    const response = await post();

    expect(response.status).toBe(409);
    expect(createPayPalOrder).not.toHaveBeenCalled();
  });

  it("422 se l'anagrafica non è completa", async () => {
    (isPersonalDataComplete as Mock).mockReturnValue(false);

    const response = await post();

    expect(response.status).toBe(422);
    expect(createPayPalOrder).not.toHaveBeenCalled();
  });

  it("crea l'ordine PayPal da 10€", async () => {
    (createPayPalOrder as Mock).mockResolvedValue({ id: "ORD1" });

    const response = await post({ method: "card" });

    expect((await response.json()).orderId).toBe("ORD1");
    expect(createPayPalOrder).toHaveBeenCalledWith(
      expect.objectContaining({ amount: "10.00", method: "card" })
    );
  });
});

describe("POST /api/memberships/paypal/capture", () => {
  const ret = (body: object = { orderId: "ORD1" }) =>
    paypalCapture(
      new NextRequest("http://localhost/api/memberships/paypal/capture", {
        method: "POST",
        body: JSON.stringify(body),
      })
    );

  beforeEach(() => {
    vi.clearAllMocks();
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "u1" },
    });
    (getCurrentAssociationYear as Mock).mockReturnValue(2026);
    (hasValidMembershipForYear as Mock).mockResolvedValue(false);
    (getPersonalDataByUserId as Mock).mockResolvedValue({});
    (isPersonalDataComplete as Mock).mockReturnValue(true);
    (findPaymentByPayPalOrderId as Mock).mockResolvedValue(null);
    (capturePayPalOrder as Mock).mockResolvedValue({
      status: "COMPLETED",
      amount: "10.00",
      raw: {},
    });
  });

  it("cattura e registra tessera + pagamento", async () => {
    const response = await ret();

    expect(response.status).toBe(200);
    expect(createPaidMembership).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "u1", year: 2026, value: 10 })
    );
  });

  it("idempotente: stesso ordine già registrato non ricattura", async () => {
    (findPaymentByPayPalOrderId as Mock).mockResolvedValue({ id: 1 });

    const response = await ret();

    expect(response.status).toBe(200);
    expect(capturePayPalOrder).not.toHaveBeenCalled();
    expect(createPaidMembership).not.toHaveBeenCalled();
  });

  it("409 se la tessera dell'anno corrente esiste già", async () => {
    (hasValidMembershipForYear as Mock).mockResolvedValue(true);

    const response = await ret();

    expect(response.status).toBe(409);
    expect(capturePayPalOrder).not.toHaveBeenCalled();
  });

  it("422 se l'anagrafica non è più completa", async () => {
    (isPersonalDataComplete as Mock).mockReturnValue(false);

    const response = await ret();

    expect(response.status).toBe(422);
    expect(capturePayPalOrder).not.toHaveBeenCalled();
  });

  it("importo catturato diverso dalla quota: nessuna tessera creata", async () => {
    (capturePayPalOrder as Mock).mockResolvedValue({
      status: "COMPLETED",
      amount: "1.00",
      raw: {},
    });

    const response = await ret();

    expect(response.status).toBe(402);
    expect(createPaidMembership).not.toHaveBeenCalled();
  });
});
