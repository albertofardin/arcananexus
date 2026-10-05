import { describe, it, expect, beforeEach, vi } from "vitest";
import { listUserPaidBookingsForYear } from "./booking.repository";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";

describe("booking.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listUserPaidBookingsForYear", () => {
    it("filtra le iscrizioni pagate dell'utente per l'anno dell'evento", async () => {
      prismaMock.booking.findMany.mockResolvedValue([]);

      await listUserPaidBookingsForYear(prismaClient, "user-1", 2026);

      expect(prismaMock.booking.findMany).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          paymentId: { not: null },
          event: {
            dateEventStart: {
              gte: new Date(Date.UTC(2026, 0, 1)),
              lt: new Date(Date.UTC(2027, 0, 1)),
            },
          },
        },
        include: {
          event: {
            select: {
              id: true,
              name: true,
              dateEventStart: true,
              campaign: { select: { name: true } },
            },
          },
          payment: {
            select: {
              id: true,
              value: true,
              paymentData: true,
              createdAt: true,
            },
          },
        },
        orderBy: { payment: { createdAt: "desc" } },
      });
    });
  });
});
