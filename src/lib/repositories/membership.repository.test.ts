import { describe, it, expect, beforeEach, vi } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { createPaidMembership } from "./membership.repository";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import { mockPayment, mockMembership } from "@/test/helpers/prisma-fixtures";

describe("membership.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // `createPaidMembership` avvolge pagamento + tessera in `prisma.$transaction`
    // (mirror di `createPaidBooking`): il "tx" passato al callback è
    // `prismaClient`, così le asserzioni su `prismaMock.payment.create` /
    // `prismaMock.membership.create` restano valide.
    prismaMock.$transaction.mockImplementation(callback =>
      callback(prismaClient)
    );
  });

  describe("createPaidMembership", () => {
    it("crea il pagamento e la tessera nella stessa transazione", async () => {
      const payment = mockPayment({ id: 5, value: new Decimal("10.00") });
      const membership = mockMembership({ id: 9, year: 2026, paymentId: 5 });
      prismaMock.payment.create.mockResolvedValue(payment);
      prismaMock.membership.create.mockResolvedValue(membership);

      const result = await createPaidMembership(prismaClient, {
        userId: "user-1",
        year: 2026,
        value: 10,
        paymentData: { provider: "paypal", orderId: "ORD1" },
      });

      expect(result).toEqual(membership);
      expect(prismaMock.payment.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          value: 10,
          paymentData: { provider: "paypal", orderId: "ORD1" },
        },
      });
      expect(prismaMock.membership.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          year: 2026,
          startDate: new Date(Date.UTC(2026, 0, 1)),
          endDate: new Date(Date.UTC(2026, 11, 31, 23, 59, 59)),
          paymentId: 5,
        },
      });
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
