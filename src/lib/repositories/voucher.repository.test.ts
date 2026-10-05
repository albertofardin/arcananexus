import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  InsufficientVoucherBalanceError,
  spendVoucher,
  voucherCoverage,
} from "./voucher.repository";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";

vi.mock("./notification.repository", () => ({ createNotification: vi.fn() }));

describe("voucher.repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("voucherCoverage: i buoni coprono al più la quota", () => {
    expect(voucherCoverage(45, 10)).toBe(10);
    expect(voucherCoverage(45, 60)).toBe(45);
    expect(voucherCoverage(45, 0)).toBe(0);
  });

  it("spendVoucher: registra un movimento negativo se il saldo basta", async () => {
    prismaMock.voucher.aggregate.mockResolvedValue({
      _sum: { amount: 10 },
    } as never);

    await spendVoucher(prismaClient, {
      userId: "u1",
      year: 2026,
      amount: 10,
      eventId: 7,
    });

    expect(prismaMock.voucher.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: -10, reason: "payment" }),
    });
  });

  it("spendVoucher: il saldo non va mai sotto zero", async () => {
    prismaMock.voucher.aggregate.mockResolvedValue({
      _sum: { amount: 5 },
    } as never);

    await expect(
      spendVoucher(prismaClient, {
        userId: "u1",
        year: 2026,
        amount: 10,
        eventId: 7,
      })
    ).rejects.toBeInstanceOf(InsufficientVoucherBalanceError);
    expect(prismaMock.voucher.create).not.toHaveBeenCalled();
  });
});
