import { describe, it, expect, beforeEach, vi } from "vitest";
import { NotificationType } from "@prisma/client";
import {
  createSupportTicket,
  listSupportTicketsForUser,
  listAllSupportTickets,
  getSupportTicketById,
  getSupportTicketWithMessages,
  addSupportMessage,
  updateSupportTicketStatus,
  deleteSupportTicket,
} from "./support.repository";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";

const supportTicket = (overrides?: {
  id?: number;
  userId?: string;
  subject?: string;
  status?: "in_attesa" | "in_lavorazione" | "risolta" | "chiusa";
}) => ({
  id: overrides?.id ?? 1,
  userId: overrides?.userId ?? "user-1",
  subject: overrides?.subject ?? "Non riesco ad accedere",
  status: overrides?.status ?? "in_attesa",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
});

describe("support.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // `createSupportTicket`/`addSupportMessage` avvolgono scrittura+notifica
    // in `prisma.$transaction`: stesso pattern di `downtime.repository.test.ts`
    // — il "tx" passato al callback è `prismaClient`, quindi le asserzioni
    // sui mock `prismaMock.*` restano valide.
    prismaMock.$transaction.mockImplementation(callback =>
      callback(prismaClient)
    );
  });

  describe("createSupportTicket", () => {
    it("crea ticket + primo messaggio e notifica tutto lo staff (DB flag + email cablate), escluso l'autore", async () => {
      prismaMock.supportTicket.create.mockResolvedValue(supportTicket());
      prismaMock.supportMessage.create.mockResolvedValue({
        id: 1,
        ticketId: 1,
        authorId: "user-1",
        body: "Ciao, ho un problema",
        createdAt: new Date(),
      });
      prismaMock.user.findMany.mockResolvedValue([
        { id: "staff-1" },
        { id: "staff-2" },
      ] as never);
      prismaMock.notification.createMany.mockResolvedValue({ count: 2 });

      const result = await createSupportTicket(prismaClient, {
        userId: "user-1",
        subject: "Non riesco ad accedere",
        body: "Ciao, ho un problema",
      });

      expect(result.id).toBe(1);
      expect(prismaMock.supportTicket.create).toHaveBeenCalledWith({
        data: { userId: "user-1", subject: "Non riesco ad accedere" },
      });
      expect(prismaMock.supportMessage.create).toHaveBeenCalledWith({
        data: { ticketId: 1, authorId: "user-1", body: "Ciao, ho un problema" },
      });
      expect(prismaMock.user.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { isSviluppo: true },
            { email: { in: expect.arrayContaining(["mattia@arcana.it"]) } },
          ],
        },
        select: { id: true },
      });
      expect(prismaMock.notification.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: "staff-1",
            type: NotificationType.support_new,
            entityId: 1,
          },
          {
            userId: "staff-2",
            type: NotificationType.support_new,
            entityId: 1,
          },
        ],
      });
    });

    it("non notifica l'autore stesso se è (per assurdo) lui stesso dello staff", async () => {
      prismaMock.supportTicket.create.mockResolvedValue(
        supportTicket({ userId: "staff-1" })
      );
      prismaMock.supportMessage.create.mockResolvedValue({
        id: 1,
        ticketId: 1,
        authorId: "staff-1",
        body: "Ciao",
        createdAt: new Date(),
      });
      prismaMock.user.findMany.mockResolvedValue([
        { id: "staff-1" },
        { id: "staff-2" },
      ] as never);
      prismaMock.notification.createMany.mockResolvedValue({ count: 1 });

      await createSupportTicket(prismaClient, {
        userId: "staff-1",
        subject: "Test",
        body: "Ciao",
      });

      expect(prismaMock.notification.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: "staff-2",
            type: NotificationType.support_new,
            entityId: 1,
          },
        ],
      });
    });
  });

  describe("listSupportTicketsForUser", () => {
    it("ritorna i ticket dell'utente ordinati per updatedAt desc, con anteprima testuale (HTML rimosso)", async () => {
      prismaMock.supportTicket.findMany.mockResolvedValue([
        {
          ...supportTicket(),
          user: { name: "Mario Rossi", email: "mario@example.com" },
          messages: [{ body: "<p>Ciao <b>a tutti</b></p>" }],
          _count: { messages: 3 },
        },
      ] as never);

      const [item] = await listSupportTicketsForUser(prismaClient, "user-1");

      expect(prismaMock.supportTicket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1" },
          orderBy: { updatedAt: "desc" },
        })
      );
      expect(item).toMatchObject({
        id: 1,
        subject: "Non riesco ad accedere",
        status: "in_attesa",
        messageCount: 3,
        lastMessagePreview: "Ciao a tutti",
        author: { name: "Mario Rossi", email: "mario@example.com" },
      });
    });

    it("tronca l'anteprima oltre 140 caratteri", async () => {
      const longText = "a".repeat(200);
      prismaMock.supportTicket.findMany.mockResolvedValue([
        {
          ...supportTicket(),
          user: { name: "Mario Rossi", email: "mario@example.com" },
          messages: [{ body: `<p>${longText}</p>` }],
          _count: { messages: 1 },
        },
      ] as never);

      const [item] = await listSupportTicketsForUser(prismaClient, "user-1");

      expect(item.lastMessagePreview).toHaveLength(141); // 140 + "…"
      expect(item.lastMessagePreview?.endsWith("…")).toBe(true);
    });

    it("ritorna null come anteprima se il ticket non ha ancora messaggi", async () => {
      prismaMock.supportTicket.findMany.mockResolvedValue([
        {
          ...supportTicket(),
          user: { name: "Mario Rossi", email: "mario@example.com" },
          messages: [],
          _count: { messages: 0 },
        },
      ] as never);

      const [item] = await listSupportTicketsForUser(prismaClient, "user-1");

      expect(item.lastMessagePreview).toBeNull();
    });
  });

  describe("listAllSupportTickets", () => {
    it("ritorna tutti i ticket, senza filtro per utente (vista staff)", async () => {
      prismaMock.supportTicket.findMany.mockResolvedValue([
        {
          ...supportTicket({ id: 1, userId: "user-1" }),
          user: { name: "Mario Rossi", email: "mario@example.com" },
          messages: [],
          _count: { messages: 0 },
        },
        {
          ...supportTicket({ id: 2, userId: "user-2" }),
          user: { name: "Luca Bianchi", email: "luca@example.com" },
          messages: [],
          _count: { messages: 0 },
        },
      ] as never);

      const result = await listAllSupportTickets(prismaClient);

      expect(result).toHaveLength(2);
      expect(prismaMock.supportTicket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { updatedAt: "desc" } })
      );
      expect(
        prismaMock.supportTicket.findMany.mock.calls[0][0]
      ).not.toHaveProperty("where");
    });
  });

  describe("getSupportTicketById", () => {
    it("ritorna il ticket grezzo per id", async () => {
      prismaMock.supportTicket.findUnique.mockResolvedValue(supportTicket());

      const result = await getSupportTicketById(prismaClient, 1);

      expect(result).toEqual(supportTicket());
      expect(prismaMock.supportTicket.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it("ritorna null se il ticket non esiste", async () => {
      prismaMock.supportTicket.findUnique.mockResolvedValue(null);

      const result = await getSupportTicketById(prismaClient, 999);

      expect(result).toBeNull();
    });
  });

  describe("getSupportTicketWithMessages", () => {
    it("ritorna il ticket con i messaggi in ordine cronologico e isStaffAuthor risolto live", async () => {
      prismaMock.supportTicket.findUnique.mockResolvedValue({
        ...supportTicket(),
        messages: [
          {
            id: 1,
            body: "Ciao, ho un problema",
            createdAt: new Date("2024-01-01"),
            authorId: "user-1",
            author: {
              id: "user-1",
              name: "Mario Rossi",
              email: "mario@example.com",
              isSviluppo: false,
            },
          },
          {
            id: 2,
            body: "Ti aiutiamo subito",
            createdAt: new Date("2024-01-02"),
            authorId: "staff-1",
            author: {
              id: "staff-1",
              name: "Staff Uno",
              email: "staff@example.com",
              isSviluppo: true,
            },
          },
        ],
      } as never);

      const result = await getSupportTicketWithMessages(prismaClient, 1);

      expect(result?.messages).toHaveLength(2);
      expect(result?.messages[0]).toMatchObject({
        authorName: "Mario Rossi",
        isStaffAuthor: false,
      });
      expect(result?.messages[1]).toMatchObject({
        authorName: "Staff Uno",
        isStaffAuthor: true,
      });
    });

    it("riconosce come staff anche un'email cablata senza il flag DB", async () => {
      prismaMock.supportTicket.findUnique.mockResolvedValue({
        ...supportTicket(),
        messages: [
          {
            id: 1,
            body: "Ciao",
            createdAt: new Date(),
            authorId: "hardcoded-1",
            author: {
              id: "hardcoded-1",
              name: "Mattia",
              email: "mattia@arcana.it",
              isSviluppo: false,
            },
          },
        ],
      } as never);

      const result = await getSupportTicketWithMessages(prismaClient, 1);

      expect(result?.messages[0]).toMatchObject({ isStaffAuthor: true });
    });

    it("ritorna null se il ticket non esiste", async () => {
      prismaMock.supportTicket.findUnique.mockResolvedValue(null);

      const result = await getSupportTicketWithMessages(prismaClient, 999);

      expect(result).toBeNull();
    });
  });

  describe("addSupportMessage", () => {
    it("crea il messaggio, avanza 'in_attesa' -> 'in_lavorazione' quando risponde per primo lo staff, e notifica il titolare del ticket", async () => {
      prismaMock.supportTicket.findUnique.mockResolvedValue(
        supportTicket({ status: "in_attesa" })
      );
      prismaMock.supportMessage.create.mockResolvedValue({
        id: 2,
        ticketId: 1,
        authorId: "staff-1",
        body: "Ti aiutiamo subito",
        createdAt: new Date(),
      });
      prismaMock.supportTicket.update.mockResolvedValue(
        supportTicket({ status: "in_lavorazione" })
      );
      prismaMock.notification.create.mockResolvedValue({} as never);

      const result = await addSupportMessage(prismaClient, {
        ticketId: 1,
        authorId: "staff-1",
        body: "Ti aiutiamo subito",
        isStaffAuthor: true,
      });

      expect(result?.id).toBe(2);
      expect(prismaMock.supportTicket.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: "in_lavorazione" },
      });
      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          type: NotificationType.support_reply,
          entityId: 1,
        },
      });
    });

    it("non retrocede lo stato quando il titolare scrive di nuovo su un ticket già 'in_lavorazione', e notifica tutto lo staff", async () => {
      prismaMock.supportTicket.findUnique.mockResolvedValue(
        supportTicket({ status: "in_lavorazione" })
      );
      prismaMock.supportMessage.create.mockResolvedValue({
        id: 3,
        ticketId: 1,
        authorId: "user-1",
        body: "Ancora un problema",
        createdAt: new Date(),
      });
      prismaMock.supportTicket.update.mockResolvedValue(
        supportTicket({ status: "in_lavorazione" })
      );
      prismaMock.user.findMany.mockResolvedValue([{ id: "staff-1" }] as never);
      prismaMock.notification.createMany.mockResolvedValue({ count: 1 });

      await addSupportMessage(prismaClient, {
        ticketId: 1,
        authorId: "user-1",
        body: "Ancora un problema",
        isStaffAuthor: false,
      });

      expect(prismaMock.supportTicket.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {},
      });
      expect(prismaMock.notification.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: "staff-1",
            type: NotificationType.support_reply,
            entityId: 1,
          },
        ],
      });
    });

    it("riapre a 'in_attesa' un ticket 'risolta', indipendentemente da chi scrive", async () => {
      prismaMock.supportTicket.findUnique.mockResolvedValue(
        supportTicket({ status: "risolta" })
      );
      prismaMock.supportMessage.create.mockResolvedValue({
        id: 4,
        ticketId: 1,
        authorId: "user-1",
        body: "Il problema è tornato",
        createdAt: new Date(),
      });
      prismaMock.supportTicket.update.mockResolvedValue(
        supportTicket({ status: "in_attesa" })
      );
      prismaMock.user.findMany.mockResolvedValue([] as never);
      prismaMock.notification.createMany.mockResolvedValue({ count: 0 });

      await addSupportMessage(prismaClient, {
        ticketId: 1,
        authorId: "user-1",
        body: "Il problema è tornato",
        isStaffAuthor: false,
      });

      expect(prismaMock.supportTicket.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: "in_attesa" },
      });
    });

    it("non notifica il titolare se è lo staff stesso ad aver aperto il ticket", async () => {
      prismaMock.supportTicket.findUnique.mockResolvedValue(
        supportTicket({ status: "in_attesa", userId: "staff-1" })
      );
      prismaMock.supportMessage.create.mockResolvedValue({
        id: 5,
        ticketId: 1,
        authorId: "staff-1",
        body: "Nota interna",
        createdAt: new Date(),
      });
      prismaMock.supportTicket.update.mockResolvedValue(
        supportTicket({ status: "in_lavorazione" })
      );

      await addSupportMessage(prismaClient, {
        ticketId: 1,
        authorId: "staff-1",
        body: "Nota interna",
        isStaffAuthor: true,
      });

      expect(prismaMock.notification.create).not.toHaveBeenCalled();
    });

    it("ritorna null se il ticket non esiste più", async () => {
      prismaMock.supportTicket.findUnique.mockResolvedValue(null);

      const result = await addSupportMessage(prismaClient, {
        ticketId: 999,
        authorId: "user-1",
        body: "Ciao",
        isStaffAuthor: false,
      });

      expect(result).toBeNull();
      expect(prismaMock.supportMessage.create).not.toHaveBeenCalled();
    });
  });

  describe("updateSupportTicketStatus", () => {
    it("aggiorna solo lo stato", async () => {
      prismaMock.supportTicket.update.mockResolvedValue(
        supportTicket({ status: "chiusa" })
      );

      const result = await updateSupportTicketStatus(prismaClient, 1, "chiusa");

      expect(result.status).toBe("chiusa");
      expect(prismaMock.supportTicket.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: "chiusa" },
      });
    });
  });

  describe("deleteSupportTicket", () => {
    it("cancella il ticket (i messaggi cascadano a DB)", async () => {
      prismaMock.supportTicket.delete.mockResolvedValue(supportTicket());

      await deleteSupportTicket(prismaClient, 1);

      expect(prismaMock.supportTicket.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });
  });
});
