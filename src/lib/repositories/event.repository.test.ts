import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  listPublishedEvents,
  getNextPublishedEvent,
  getCurrentEventForCampaign,
} from "./event.repository";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";

const NOW = new Date("2026-07-23T12:00:00.000Z");

describe("Event Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    prismaMock.event.findMany.mockResolvedValue([]);
    prismaMock.event.count.mockResolvedValue(0);
    prismaMock.event.findFirst.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("listPublishedEvents", () => {
    it("filtra per org/campagna e solo eventi pubblicati, senza status", async () => {
      await listPublishedEvents(prismaClient, {
        orgSlug: "arcana-domine",
        campaignSlug: "campaign1",
        page: 1,
        pageSize: 50,
      });

      expect(prismaMock.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organization: { slug: "arcana-domine" },
            campaign: { slug: "campaign1" },
            OR: [{ visibility: "visible" }],
          },
        })
      );
    });

    it("noCampaign: solo eventi dell'associazione (campaignId nullo)", async () => {
      await listPublishedEvents(prismaClient, {
        noCampaign: true,
        page: 1,
        pageSize: 50,
      });

      expect(prismaMock.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ campaignId: null }),
        })
      );
    });

    it("noCampaign ha precedenza su campaignSlug se entrambi passati", async () => {
      await listPublishedEvents(prismaClient, {
        noCampaign: true,
        campaignSlug: "campaign1",
        page: 1,
        pageSize: 50,
      });

      expect(prismaMock.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ campaignId: null }),
        })
      );
      const where = prismaMock.event.findMany.mock.calls[0][0]?.where;
      expect(where).not.toHaveProperty("campaign");
    });

    it('status "past": dateEventStart strettamente prima di ora', async () => {
      await listPublishedEvents(prismaClient, {
        status: "past",
        page: 1,
        pageSize: 50,
      });

      expect(prismaMock.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dateEventStart: { lt: NOW },
          }),
        })
      );
    });

    it('status "open": dateEventStart futuro e ora dentro la finestra di pubblicazione', async () => {
      await listPublishedEvents(prismaClient, {
        status: "open",
        page: 1,
        pageSize: 50,
      });

      expect(prismaMock.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dateEventStart: { gte: NOW },
            datePublicationStart: { lte: NOW },
            datePublicationEnd: { gte: NOW },
          }),
        })
      );
    });

    it('status "upcoming": dateEventStart futuro e datePublicationStart non ancora raggiunto', async () => {
      await listPublishedEvents(prismaClient, {
        status: "upcoming",
        page: 1,
        pageSize: 50,
      });

      expect(prismaMock.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dateEventStart: { gte: NOW },
            datePublicationStart: { gt: NOW },
          }),
        })
      );
    });

    it('status "closed": dateEventStart futuro ma datePublicationEnd già passato', async () => {
      await listPublishedEvents(prismaClient, {
        status: "closed",
        page: 1,
        pageSize: 50,
      });

      expect(prismaMock.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dateEventStart: { gte: NOW },
            datePublicationEnd: { lt: NOW },
          }),
        })
      );
    });

    it('status "open" con startDate futuro: mantiene il vincolo più restrittivo', async () => {
      const farFuture = new Date("2026-12-01T00:00:00.000Z");

      await listPublishedEvents(prismaClient, {
        status: "open",
        startDate: farFuture,
        page: 1,
        pageSize: 50,
      });

      expect(prismaMock.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dateEventStart: { gte: farFuture },
            datePublicationEnd: { gte: NOW },
          }),
        })
      );
    });

    it('status "open" con startDate nel passato: non retrocede sotto "adesso"', async () => {
      const pastDate = new Date("2020-01-01T00:00:00.000Z");

      await listPublishedEvents(prismaClient, {
        status: "open",
        startDate: pastDate,
        page: 1,
        pageSize: 50,
      });

      expect(prismaMock.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dateEventStart: { gte: NOW },
          }),
        })
      );
    });

    it("combina startDate/endDate espliciti quando non c'è status", async () => {
      const start = new Date("2026-01-01T00:00:00.000Z");
      const end = new Date("2026-12-31T00:00:00.000Z");

      await listPublishedEvents(prismaClient, {
        startDate: start,
        endDate: end,
        page: 1,
        pageSize: 50,
      });

      expect(prismaMock.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dateEventStart: { gte: start, lte: end },
          }),
        })
      );
    });

    it("filtra per myBookingsUserId quando presente", async () => {
      await listPublishedEvents(prismaClient, {
        myBookingsUserId: "user-1",
        page: 1,
        pageSize: 50,
      });

      expect(prismaMock.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            bookings: { some: { userId: "user-1" } },
          }),
        })
      );
    });

    it("pagina con skip/take corretti", async () => {
      await listPublishedEvents(prismaClient, { page: 3, pageSize: 50 });

      expect(prismaMock.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 100, take: 50 })
      );
    });

    it('ordina "desc" di default quando sortDirection non è passato', async () => {
      await listPublishedEvents(prismaClient, { page: 1, pageSize: 50 });

      expect(prismaMock.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { dateEventStart: "desc" } })
      );
    });

    it('rispetta sortDirection "asc" (widget "Prossimi eventi")', async () => {
      await listPublishedEvents(prismaClient, {
        page: 1,
        pageSize: 50,
        sortDirection: "asc",
      });

      expect(prismaMock.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { dateEventStart: "asc" } })
      );
    });

    it("usa `_count.bookings` invece di caricare le prenotazioni per intero", async () => {
      await listPublishedEvents(prismaClient, { page: 1, pageSize: 50 });

      expect(prismaMock.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            _count: { select: { bookings: true } },
          }),
        })
      );
    });
  });

  describe("bozze (iscrizioni non ancora aperte)", () => {
    it("includeAllUnpublished: nessun filtro su datePublicationStart", async () => {
      await listPublishedEvents(prismaClient, {
        includeAllUnpublished: true,
        page: 1,
        pageSize: 50,
      });

      expect(prismaMock.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ OR: expect.anything() }),
        })
      );
    });

    it("unpublishedCampaignIds: pubblicati OR bozze delle proprie campagne", async () => {
      await listPublishedEvents(prismaClient, {
        unpublishedCampaignIds: [3, 4],
        page: 1,
        pageSize: 50,
      });

      expect(prismaMock.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ visibility: "visible" }, { campaignId: { in: [3, 4] } }],
          }),
        })
      );
    });
  });

  describe("getNextPublishedEvent", () => {
    it("ordina per dateEventStart crescente e prende un solo record, senza count()", async () => {
      const startDate = new Date("2026-07-23T00:00:00.000Z");

      await getNextPublishedEvent(prismaClient, {
        orgSlug: "arcana-domine",
        campaignSlug: "campaign1",
        startDate,
      });

      expect(prismaMock.event.findFirst).toHaveBeenCalledWith({
        where: {
          organization: { slug: "arcana-domine" },
          campaign: { slug: "campaign1" },
          visibility: "visible",
          dateEventStart: { gte: startDate },
        },
        include: {
          campaign: { select: { name: true, slug: true } },
          _count: { select: { bookings: true } },
        },
        orderBy: { dateEventStart: "asc" },
      });
      expect(prismaMock.event.count).not.toHaveBeenCalled();
    });

    it("filtra solo per campo valorizzato quando orgSlug/campaignSlug sono assenti", async () => {
      await getNextPublishedEvent(prismaClient, {
        startDate: NOW,
      });

      expect(prismaMock.event.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ campaign: expect.anything() }),
        })
      );
    });
  });

  describe("getCurrentEventForCampaign", () => {
    it("preferisce il prossimo evento futuro, senza filtro su datePublicationStart", async () => {
      const upcoming = { id: 1, name: "Evento futuro", dateEventStart: NOW };
      prismaMock.event.findFirst.mockResolvedValueOnce(upcoming as never);

      const result = await getCurrentEventForCampaign(prismaClient, 7, NOW);

      expect(result).toBe(upcoming);
      expect(prismaMock.event.findFirst).toHaveBeenCalledTimes(1);
      expect(prismaMock.event.findFirst).toHaveBeenCalledWith({
        where: { campaignId: 7, dateEventStart: { gte: NOW } },
        orderBy: { dateEventStart: "asc" },
        select: { id: true, name: true, dateEventStart: true },
      });
    });

    it("ripiega sull'ultimo evento passato quando non ce n'è uno futuro", async () => {
      const past = { id: 2, name: "Evento passato", dateEventStart: NOW };
      prismaMock.event.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(past as never);

      const result = await getCurrentEventForCampaign(prismaClient, 7, NOW);

      expect(result).toBe(past);
      expect(prismaMock.event.findFirst).toHaveBeenCalledTimes(2);
      expect(prismaMock.event.findFirst).toHaveBeenLastCalledWith({
        where: { campaignId: 7 },
        orderBy: { dateEventStart: "desc" },
        select: { id: true, name: true, dateEventStart: true },
      });
    });

    it("restituisce null quando la campagna non ha alcun evento", async () => {
      prismaMock.event.findFirst.mockResolvedValue(null);

      const result = await getCurrentEventForCampaign(prismaClient, 7, NOW);

      expect(result).toBeNull();
    });
  });
});
