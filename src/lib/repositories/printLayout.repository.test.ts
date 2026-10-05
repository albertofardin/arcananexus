import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getPrintLayoutByIdScoped,
  listPrintLayouts,
} from "./printLayout.repository";
import { listReferenceDataForPrint } from "./referenceData.repository";
import { listCharactersForPrint } from "./character.repository";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";

describe("PrintLayout Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists only the campaign's layouts", async () => {
    prismaMock.printLayout.findMany.mockResolvedValue([]);

    await listPrintLayouts(prismaClient, 1);

    expect(prismaMock.printLayout.findMany).toHaveBeenCalledWith({
      where: { campaignId: 1 },
      orderBy: { name: "asc" },
    });
  });

  it("scopes the lookup by id to the campaign", async () => {
    prismaMock.printLayout.findUnique.mockResolvedValue(null);

    const result = await getPrintLayoutByIdScoped(prismaClient, 5, 2);

    expect(result).toBeNull();
    expect(prismaMock.printLayout.findUnique).toHaveBeenCalledWith({
      where: { id: 5, campaignId: 2 },
    });
  });

  it("scopes printable characters and entries to the campaign", async () => {
    prismaMock.character.findMany.mockResolvedValue([]);
    prismaMock.referenceData.findMany.mockResolvedValue([]);

    await listCharactersForPrint(prismaClient, 1, [3, 4]);
    await listReferenceDataForPrint(prismaClient, 1, [7]);

    expect(prismaMock.character.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { campaignId: 1, id: { in: [3, 4] } } })
    );
    expect(prismaMock.referenceData.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [7] }, dataType: { campaignId: 1 } },
      })
    );
  });
});
