import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getDowntimeByIdScoped,
  listDowntimesForCampaign,
  markDowntimeAsRead,
  updateDowntimeStatus,
} from "./downtime.repository";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import { mockAction } from "@/test/helpers/prisma-fixtures";
import type { DowntimeStatus } from "@/lib/downtime/status";

const downtimeAction = (overrides?: {
  id?: number;
  characterId?: number | null;
  characterUserId?: string;
  category?: string;
  description?: string;
  readDate?: string | null;
  status?: DowntimeStatus;
  updateDate?: string | null;
}) => ({
  ...mockAction({
    id: overrides?.id ?? 1,
    characterId: overrides?.characterId ?? 10,
    featureId: 7,
    actionData: {
      category: overrides?.category ?? "Lavorare",
      description: overrides?.description ?? "Ho lavorato in miniera",
      readDate: overrides?.readDate ?? null,
      ...(overrides?.status !== undefined ? { status: overrides.status } : {}),
      ...(overrides?.updateDate !== undefined
        ? { updateDate: overrides.updateDate }
        : {}),
    },
  }),
  character:
    overrides?.characterId === null
      ? null
      : {
          id: overrides?.characterId ?? 10,
          name: "Aldric",
          avatar: null,
          userId: overrides?.characterUserId ?? "player-1",
          user: { name: "Mario Rossi" },
        },
});

describe("downtime.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // `updateDowntimeStatus` (T-0xx, notifica al giocatore quando il master
    // cambia stato) avvolge scrittura+notifica in `prisma.$transaction`: il
    // "tx" passato al callback è `prismaClient` (stesso oggetto sotto il
    // cofano di `prismaMock`, solo tipizzato come `PrismaClient` reale — vedi
    // il commento in `@/test/mocks/prisma` — quindi le asserzioni esistenti
    // su `prismaMock.action.update` restano valide senza un secondo mock).
    prismaMock.$transaction.mockImplementation(callback =>
      callback(prismaClient)
    );
  });

  describe("listDowntimesForCampaign", () => {
    it("applies no character scoping for a master viewer", async () => {
      prismaMock.action.findMany.mockResolvedValue([]);

      await listDowntimesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: { isMaster: true },
      });

      expect(prismaMock.action.findMany).toHaveBeenCalledTimes(2);
      const [call] = prismaMock.action.findMany.mock.calls;
      expect(call[0].where).toEqual({
        feature: {
          campaignId: 1,
          featureType: { functionName: "downtime" },
        },
      });
    });

    it("scopes to own characters for a non-master viewer", async () => {
      prismaMock.action.findMany.mockResolvedValue([]);

      await listDowntimesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: { isMaster: false, characterIds: [10, 11] },
      });

      const [call] = prismaMock.action.findMany.mock.calls;
      expect(call[0].where).toEqual({
        feature: {
          campaignId: 1,
          featureType: { functionName: "downtime" },
        },
        characterId: { in: [10, 11] },
      });
    });

    it("excludes everything for a non-master viewer with no character at all", async () => {
      prismaMock.action.findMany.mockResolvedValue([]);

      await listDowntimesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: { isMaster: false, characterIds: [] },
      });

      const [call] = prismaMock.action.findMany.mock.calls;
      expect(call[0].where).toMatchObject({ id: -1 });
    });

    it("applies the author filter", async () => {
      prismaMock.action.findMany.mockResolvedValue([]);

      await listDowntimesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: { isMaster: true },
        filters: { authorCharacterId: 42 },
      });

      const [call] = prismaMock.action.findMany.mock.calls;
      expect(call[0].where).toMatchObject({ characterId: 42 });
    });

    it("filters in-memory by category, matching the actionData.category string exactly", async () => {
      prismaMock.action.findMany.mockResolvedValueOnce([
        downtimeAction({ id: 1, category: "Sabotare" }),
        downtimeAction({ id: 2, category: "Costruire" }),
      ]);
      prismaMock.action.findMany.mockResolvedValueOnce([]);

      const result = await listDowntimesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: { isMaster: true },
        filters: { category: "Sabotare" },
      });

      expect(result.downtimes.map(d => d.id)).toEqual([1]);
    });

    it("applies the date-range filter", async () => {
      prismaMock.action.findMany.mockResolvedValue([]);

      await listDowntimesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: { isMaster: true },
        filters: { dateFrom: new Date("2024-01-01") },
      });

      const [call] = prismaMock.action.findMany.mock.calls;
      expect(call[0].where).toMatchObject({
        creationDate: { gte: new Date("2024-01-01") },
      });
    });

    it("filters in-memory by search on category name, author character name and player name", async () => {
      const target = downtimeAction({ id: 1, category: "Sabotare" });
      const other = downtimeAction({ id: 2, category: "Costruire" });
      prismaMock.action.findMany.mockResolvedValueOnce([target, other]);
      prismaMock.action.findMany.mockResolvedValueOnce([]);

      const result = await listDowntimesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: { isMaster: true },
        filters: { search: "sabota" },
      });

      expect(result.downtimes.map(d => d.id)).toEqual([1]);
    });

    it("paginates AFTER the in-memory search filter, not before", async () => {
      const matching = [1, 2, 3].map(id =>
        downtimeAction({ id, category: "cerca" })
      );
      const nonMatching = [4, 5].map(id =>
        downtimeAction({ id, category: "altro" })
      );
      prismaMock.action.findMany.mockResolvedValueOnce([
        ...matching,
        ...nonMatching,
      ]);
      prismaMock.action.findMany.mockResolvedValueOnce([]);

      const result = await listDowntimesForCampaign(prismaClient, {
        campaignId: 1,
        page: 2,
        pageSize: 2,
        viewer: { isMaster: true },
        filters: { search: "cerca" },
      });

      expect(result.downtimes.map(d => d.id)).toEqual([3]);
      expect(result.pagination).toEqual({
        page: 2,
        pageSize: 2,
        totalCount: 3,
        totalPages: 2,
      });
    });

    it("drops rows whose author character is missing, never exposing a null author", async () => {
      prismaMock.action.findMany.mockResolvedValueOnce([
        downtimeAction({ id: 1, characterId: null }),
      ]);
      prismaMock.action.findMany.mockResolvedValueOnce([]);

      const result = await listDowntimesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: { isMaster: true },
      });

      expect(result.downtimes).toEqual([]);
    });

    it("resolves readDate from actionData", async () => {
      prismaMock.action.findMany.mockResolvedValueOnce([
        downtimeAction({ id: 1, readDate: "2024-03-01T10:00:00.000Z" }),
      ]);
      prismaMock.action.findMany.mockResolvedValueOnce([]);

      const result = await listDowntimesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: { isMaster: true },
      });

      expect(result.downtimes[0].readDate).toEqual(
        new Date("2024-03-01T10:00:00.000Z")
      );
    });

    it("resolves updateDate as null when the master has never modified the downtime", async () => {
      prismaMock.action.findMany.mockResolvedValueOnce([
        downtimeAction({ id: 1 }),
      ]);
      prismaMock.action.findMany.mockResolvedValueOnce([]);

      const result = await listDowntimesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: { isMaster: true },
      });

      expect(result.downtimes[0].updateDate).toBeNull();
    });

    it("resolves updateDate from actionData when present", async () => {
      prismaMock.action.findMany.mockResolvedValueOnce([
        downtimeAction({
          id: 1,
          updateDate: "2024-03-05T12:00:00.000Z",
        }),
      ]);
      prismaMock.action.findMany.mockResolvedValueOnce([]);

      const result = await listDowntimesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: { isMaster: true },
      });

      expect(result.downtimes[0].updateDate).toEqual(
        new Date("2024-03-05T12:00:00.000Z")
      );
    });

    it("defaults status to waiting for legacy rows without status in actionData", async () => {
      prismaMock.action.findMany.mockResolvedValueOnce([
        downtimeAction({ id: 1 }),
      ]);
      prismaMock.action.findMany.mockResolvedValueOnce([]);

      const result = await listDowntimesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: { isMaster: true },
      });

      expect(result.downtimes[0].status).toBe("waiting");
    });

    it("resolves status and response from actionData when present", async () => {
      prismaMock.action.findMany.mockResolvedValueOnce([
        {
          ...downtimeAction({ id: 1, status: "approve" }),
          actionData: {
            description: "Ho lavorato in miniera",
            readDate: null,
            status: "approve",
            response: "<p>Ottimo lavoro</p>",
          },
        },
      ]);
      prismaMock.action.findMany.mockResolvedValueOnce([]);

      const result = await listDowntimesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: { isMaster: true },
      });

      expect(result.downtimes[0].status).toBe("approve");
      expect(result.downtimes[0].response).toBe("<p>Ottimo lavoro</p>");
    });

    it("filters in-memory by status, defaulting legacy rows to waiting", async () => {
      const approved = downtimeAction({ id: 1, status: "approve" });
      const legacyWaiting = downtimeAction({ id: 2 });
      const refused = downtimeAction({ id: 3, status: "refuse" });
      prismaMock.action.findMany.mockResolvedValueOnce([
        approved,
        legacyWaiting,
        refused,
      ]);
      prismaMock.action.findMany.mockResolvedValueOnce([]);

      const result = await listDowntimesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: { isMaster: true },
        filters: { status: "waiting" },
      });

      expect(result.downtimes.map(d => d.id)).toEqual([2]);
    });

    it("paginates AFTER the in-memory status filter, not before", async () => {
      const matching = [1, 2, 3].map(id =>
        downtimeAction({ id, status: "approve" })
      );
      const nonMatching = [4, 5].map(id =>
        downtimeAction({ id, status: "refuse" })
      );
      prismaMock.action.findMany.mockResolvedValueOnce([
        ...matching,
        ...nonMatching,
      ]);
      prismaMock.action.findMany.mockResolvedValueOnce([]);

      const result = await listDowntimesForCampaign(prismaClient, {
        campaignId: 1,
        page: 2,
        pageSize: 2,
        viewer: { isMaster: true },
        filters: { status: "approve" },
      });

      expect(result.downtimes.map(d => d.id)).toEqual([3]);
      expect(result.pagination).toEqual({
        page: 2,
        pageSize: 2,
        totalCount: 3,
        totalPages: 2,
      });
    });

    it("builds author/category filter options from the visible set, ignoring other filters", async () => {
      prismaMock.action.findMany
        .mockResolvedValueOnce([]) // lista principale (filtrata)
        .mockResolvedValueOnce([
          downtimeAction({ id: 1, characterId: 10, category: "Lavorare" }),
          downtimeAction({ id: 2, characterId: 11, category: "Costruire" }),
        ]);

      const result = await listDowntimesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: { isMaster: true },
        filters: { search: "qualunque cosa" },
      });

      expect(result.filterOptions).toEqual({
        authors: [
          { id: 10, name: "Aldric", avatar: null },
          { id: 11, name: "Aldric", avatar: null },
        ],
        categories: ["Costruire", "Lavorare"],
      });
    });
  });

  describe("getDowntimeByIdScoped", () => {
    it("returns null when the downtime does not exist or is not visible (findFirst resolves null)", async () => {
      prismaMock.action.findFirst.mockResolvedValue(null);

      const result = await getDowntimeByIdScoped(prismaClient, {
        campaignId: 1,
        actionId: 999,
        viewer: { isMaster: false, characterIds: [10] },
      });

      expect(result).toBeNull();
      expect(prismaMock.action.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 999,
            feature: {
              campaignId: 1,
              featureType: { functionName: "downtime" },
            },
            characterId: { in: [10] },
          },
        })
      );
    });

    it("returns the downtime with its author and category when found and visible", async () => {
      prismaMock.action.findFirst.mockResolvedValue(
        downtimeAction({ id: 1, category: "Lavorare" }) as never
      );

      const result = await getDowntimeByIdScoped(prismaClient, {
        campaignId: 1,
        actionId: 1,
        viewer: { isMaster: true },
      });

      expect(result?.id).toBe(1);
      expect(result?.author).toEqual({
        id: 10,
        name: "Aldric",
        avatar: null,
        userName: "Mario Rossi",
      });
      expect(result?.category).toBe("Lavorare");
    });

    it("returns null when the author character is missing (data corrotto, mai atteso)", async () => {
      prismaMock.action.findFirst.mockResolvedValue(
        downtimeAction({ id: 1, characterId: null }) as never
      );

      const result = await getDowntimeByIdScoped(prismaClient, {
        campaignId: 1,
        actionId: 1,
        viewer: { isMaster: true },
      });

      expect(result).toBeNull();
    });
  });

  describe("markDowntimeAsRead", () => {
    it("sets readDate when the downtime exists and belongs to the campaign", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        actionData: {
          description: "Ho lavorato in miniera",
          readDate: null,
        },
      } as never);

      const result = await markDowntimeAsRead(prismaClient, {
        campaignId: 1,
        actionId: 1,
      });

      expect(result).toBe(true);
      expect(prismaMock.action.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          actionData: expect.objectContaining({
            description: "Ho lavorato in miniera",
            readDate: expect.any(String),
          }),
        },
      });
    });

    it("is idempotent: does not overwrite an already-set readDate", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        actionData: {
          description: "Ho lavorato in miniera",
          readDate: "2024-03-01T10:00:00.000Z",
        },
      } as never);

      const result = await markDowntimeAsRead(prismaClient, {
        campaignId: 1,
        actionId: 1,
      });

      expect(result).toBe(true);
      expect(prismaMock.action.update).not.toHaveBeenCalled();
    });

    it("returns false without writing when the downtime does not belong to this campaign", async () => {
      prismaMock.action.findFirst.mockResolvedValue(null);

      const result = await markDowntimeAsRead(prismaClient, {
        campaignId: 1,
        actionId: 999,
      });

      expect(result).toBe(false);
      expect(prismaMock.action.update).not.toHaveBeenCalled();
    });
  });

  describe("updateDowntimeStatus", () => {
    it("updates status and response, preserving subject/description/readDate", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        actionData: {
          subject: "Indagini in città",
          description: "Ho lavorato in miniera",
          readDate: "2024-03-01T10:00:00.000Z",
          status: "waiting",
          response: null,
        },
      } as never);

      const result = await updateDowntimeStatus(prismaClient, {
        campaignId: 1,
        actionId: 1,
        status: "approve",
        response: "<p>Ottimo lavoro</p>",
      });

      expect(result).toEqual({
        status: "approve",
        response: "<p>Ottimo lavoro</p>",
        masterNote: null,
        updateDate: expect.any(Date),
      });
      expect(prismaMock.action.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          actionData: {
            subject: "Indagini in città",
            description: "Ho lavorato in miniera",
            readDate: "2024-03-01T10:00:00.000Z",
            status: "approve",
            response: "<p>Ottimo lavoro</p>",
            masterNote: null,
            updateDate: expect.any(String),
          },
        },
      });
    });

    it("saves the masterNote alongside the response, never exposed to the player's response field", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        actionData: {
          description: "Ho lavorato in miniera",
          readDate: null,
          status: "waiting",
        },
      } as never);

      const result = await updateDowntimeStatus(prismaClient, {
        campaignId: 1,
        actionId: 1,
        status: "approve",
        response: "<p>Ottimo lavoro</p>",
        masterNote: "<p>Nota riservata</p>",
      });

      expect(result).toEqual({
        status: "approve",
        response: "<p>Ottimo lavoro</p>",
        masterNote: "<p>Nota riservata</p>",
        updateDate: expect.any(Date),
      });
      expect(prismaMock.action.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          actionData: expect.objectContaining({
            response: "<p>Ottimo lavoro</p>",
            masterNote: "<p>Nota riservata</p>",
          }),
        },
      });
    });

    it("saves an absent/empty response as null, not as an empty string", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        actionData: {
          description: "Ho lavorato in miniera",
          readDate: null,
          status: "waiting",
        },
      } as never);

      const result = await updateDowntimeStatus(prismaClient, {
        campaignId: 1,
        actionId: 1,
        status: "refuse",
      });

      expect(result).toEqual({
        status: "refuse",
        response: null,
        masterNote: null,
        updateDate: expect.any(Date),
      });
      expect(prismaMock.action.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          actionData: expect.objectContaining({
            status: "refuse",
            response: null,
            masterNote: null,
            updateDate: expect.any(String),
          }),
        },
      });
    });

    it("can change status/response repeatedly, not just once", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        actionData: {
          description: "Ho lavorato in miniera",
          readDate: null,
          status: "approve",
          response: "<p>Prima risposta</p>",
        },
      } as never);

      const result = await updateDowntimeStatus(prismaClient, {
        campaignId: 1,
        actionId: 1,
        status: "refuse",
        response: "<p>Seconda risposta</p>",
      });

      expect(result).toEqual({
        status: "refuse",
        response: "<p>Seconda risposta</p>",
        masterNote: null,
        updateDate: expect.any(Date),
      });
      expect(prismaMock.action.update).toHaveBeenCalled();
    });

    it("notifica il proprietario del PG autore quando lo stato cambia davvero (T-0xx)", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        actionData: {
          description: "Ho lavorato in miniera",
          readDate: null,
          status: "waiting",
        },
        character: { userId: "player-1" },
      } as never);

      await updateDowntimeStatus(prismaClient, {
        campaignId: 1,
        actionId: 1,
        status: "approve",
      });

      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: {
          userId: "player-1",
          campaignId: 1,
          type: "downtime",
          entityId: 1,
        },
      });
    });

    it("non notifica se lo stato salvato è identico a quello precedente (T-0xx)", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        actionData: {
          description: "Ho lavorato in miniera",
          readDate: null,
          status: "approve",
          response: "<p>Vecchia risposta</p>",
        },
        character: { userId: "player-1" },
      } as never);

      // Stesso status di prima ("approve"), solo la risposta cambia: nessun
      // "cambio di stato" reale da notificare.
      await updateDowntimeStatus(prismaClient, {
        campaignId: 1,
        actionId: 1,
        status: "approve",
        response: "<p>Risposta aggiornata</p>",
      });

      expect(prismaMock.notification.create).not.toHaveBeenCalled();
    });

    it("non esplode e non notifica se il personaggio autore non risolve più (dato storico incoerente)", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        actionData: {
          description: "Ho lavorato in miniera",
          status: "waiting",
        },
        character: null,
      } as never);

      const result = await updateDowntimeStatus(prismaClient, {
        campaignId: 1,
        actionId: 1,
        status: "approve",
      });

      expect(result?.status).toBe("approve");
      expect(prismaMock.notification.create).not.toHaveBeenCalled();
    });

    it("returns null without writing when the downtime does not exist or is not scoped to this campaign", async () => {
      prismaMock.action.findFirst.mockResolvedValue(null);

      const result = await updateDowntimeStatus(prismaClient, {
        campaignId: 1,
        actionId: 999,
        status: "approve",
      });

      expect(result).toBeNull();
      expect(prismaMock.action.update).not.toHaveBeenCalled();
    });
  });
});
