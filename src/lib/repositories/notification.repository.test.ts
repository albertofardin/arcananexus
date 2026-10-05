import { describe, it, expect, beforeEach, vi } from "vitest";
import { CharacterType, NotificationType } from "@prisma/client";
import {
  createNotification,
  createNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteOldReadNotifications,
  READ_NOTIFICATION_RETENTION_DAYS,
  listNotificationsForUser,
} from "./notification.repository";
import {
  MISSIVE_COMMUN_TEXT,
  MISSIVE_MASTER_TEXT,
} from "@/lib/validations/missive";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import {
  mockAction,
  mockCampaign,
  mockCharacter,
  mockNotification,
  mockUser,
} from "@/test/helpers/prisma-fixtures";
import { isEmailConfigured } from "@/lib/email/client";
import { sendNotificationEmail } from "@/lib/email/notificationEmail";

// Mock isolato per `appPrisma` (`@/lib/db`), usato SOLO dal fan-out email
// (`notifyEmail`) — separato da `prismaMock`/`prismaClient` sopra, che
// restano il `PrismaTransactionClient` passato esplicitamente a
// `createNotification`/`createNotifications` dai chiamanti reali. `vi.hoisted`
// perché `vi.mock` viene issato sopra gli import.
const emailDbMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  campaign: { findUnique: vi.fn() },
  action: { findUnique: vi.fn() },
  character: { findUnique: vi.fn() },
  supportTicket: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: emailDbMock }));
// `isEmailConfigured` di default `false` (stesso comportamento reale di
// `isPushConfigured` in test — nessuna vera `.env` caricata): i test sotto
// "createNotification → notifyEmail" lo sovrascrivono a `true` quando serve
// esercitare il fan-out.
vi.mock("@/lib/email/client", () => ({
  isEmailConfigured: vi.fn(() => false),
}));
// Le flag reali sono interruttori di debug hardcoded (anche `false`): qui
// vanno forzate a `true` per esercitare il fan-out.
vi.mock("@/lib/email/emailFlags", () => ({
  EMAIL_NOTIFICATION_SUPPORT: true,
  EMAIL_NOTIFICATION_MISSIVE: true,
  EMAIL_NOTIFICATION_DOWNTIME: true,
  EMAIL_NOTIFICATION_CHARACTER_STATUS: true,
  EMAIL_NOTIFICATION_EVENT_BOOKING: true,
  EMAIL_NOTIFICATION_VOUCHER: true,
}));
vi.mock("@/lib/email/notificationEmail", () => ({
  sendNotificationEmail: vi.fn(),
  campaignColorHex: vi.fn(() => "#0f62fe"),
}));

describe("notification.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // `listNotificationsForUser` chiama SEMPRE `deleteOldReadNotifications`
    // (pulizia automatica) prima della query principale — default innocuo
    // qui, i test dedicati sotto lo sovrascrivono quando serve verificarne
    // l'interazione.
    prismaMock.notification.deleteMany.mockResolvedValue({ count: 0 });
  });

  describe("createNotification", () => {
    it("crea una singola notifica", async () => {
      const notification = mockNotification();
      prismaMock.notification.create.mockResolvedValue(notification);

      const result = await createNotification(prismaClient, {
        userId: "user-1",
        campaignId: 1,
        type: NotificationType.missive,
        entityId: 42,
      });

      expect(result).toEqual(notification);
      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          campaignId: 1,
          type: NotificationType.missive,
          entityId: 42,
        },
      });
    });
  });

  describe("createNotifications", () => {
    it("crea in blocco più righe (fan-out), senza dedup a carico suo", async () => {
      prismaMock.notification.createMany.mockResolvedValue({ count: 2 });

      const rows = [
        {
          userId: "user-1",
          campaignId: 1,
          type: NotificationType.character_status,
          entityId: 5,
        },
        {
          userId: "user-2",
          campaignId: 1,
          type: NotificationType.character_status,
          entityId: 5,
        },
      ];
      const result = await createNotifications(prismaClient, rows);

      expect(result).toEqual({ count: 2 });
      expect(prismaMock.notification.createMany).toHaveBeenCalledWith({
        data: rows,
      });
    });

    it("non chiama Prisma su un array vuoto (no-op)", async () => {
      const result = await createNotifications(prismaClient, []);

      expect(result).toEqual({ count: 0 });
      expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
    });
  });

  // Fan-out email (T-0xx, `notifyEmail`): fire-and-forget come il fan-out
  // push, quindi mai atteso da `createNotification` — `vi.waitFor` aspetta
  // che la promise interna si risolva prima di verificare.
  describe("createNotification → notifyEmail", () => {
    it("invia l'email con oggetto/testo arricchiti quando l'utente ha le notifiche email attive", async () => {
      vi.mocked(isEmailConfigured).mockReturnValue(true);
      prismaMock.notification.create.mockResolvedValue(mockNotification());
      emailDbMock.user.findUnique.mockResolvedValue(
        mockUser({ email: "aria@example.com", emailNotificationsEnabled: true })
      );
      emailDbMock.campaign.findUnique.mockResolvedValue(
        mockCampaign({ name: "Nuova Frontiera", slug: "nuova-frontiera" })
      );
      emailDbMock.action.findUnique.mockResolvedValue({
        ...mockAction({
          id: 42,
          actionData: { subject: "Un avviso", receiverCharacterId: 20 },
        }),
        character: null,
      });
      emailDbMock.character.findUnique.mockResolvedValue({ name: "Berith" });

      await createNotification(prismaClient, {
        userId: "user-1",
        campaignId: 1,
        type: NotificationType.missive,
        entityId: 42,
      });

      await vi.waitFor(() => {
        expect(sendNotificationEmail).toHaveBeenCalled();
      });
      expect(sendNotificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "aria@example.com",
          subject: "Nuova missiva — Nuova Frontiera",
          heading: "In Nuova Frontiera è arrivata una nuova missiva per Berith",
          campaignName: "Nuova Frontiera",
          ctaUrl: expect.stringContaining(
            "/dashboard/nuova-frontiera/missive/42"
          ),
        })
      );
    });

    it("non invia nulla quando l'utente ha disattivato le notifiche email dal profilo", async () => {
      vi.mocked(isEmailConfigured).mockReturnValue(true);
      prismaMock.notification.create.mockResolvedValue(mockNotification());
      emailDbMock.user.findUnique.mockResolvedValue(
        mockUser({ emailNotificationsEnabled: false })
      );

      await createNotification(prismaClient, {
        userId: "user-1",
        campaignId: 1,
        type: NotificationType.missive,
        entityId: 42,
      });

      // Nessuna asserzione negativa immediata affidabile su un fire-and-forget
      // mai risolto: si aspetta che la lookup dell'utente sia stata
      // interpellata (prova che `notifyEmail` è partito), poi si verifica che
      // non sia mai arrivato a costruire/inviare l'email.
      await vi.waitFor(() => {
        expect(emailDbMock.user.findUnique).toHaveBeenCalled();
      });
      expect(sendNotificationEmail).not.toHaveBeenCalled();
      expect(emailDbMock.campaign.findUnique).not.toHaveBeenCalled();
    });

    it("non chiama nemmeno la lookup utente quando Brevo non è configurato", async () => {
      vi.mocked(isEmailConfigured).mockReturnValue(false);
      prismaMock.notification.create.mockResolvedValue(mockNotification());

      await createNotification(prismaClient, {
        userId: "user-1",
        campaignId: 1,
        type: NotificationType.missive,
        entityId: 42,
      });

      expect(emailDbMock.user.findUnique).not.toHaveBeenCalled();
      expect(sendNotificationEmail).not.toHaveBeenCalled();
    });
  });

  describe("countUnreadNotifications", () => {
    it("conta le notifiche non lette dell'utente", async () => {
      prismaMock.notification.count.mockResolvedValue(3);

      const result = await countUnreadNotifications(prismaClient, "user-1");

      expect(result).toBe(3);
      expect(prismaMock.notification.count).toHaveBeenCalledWith({
        where: { userId: "user-1", read: false },
      });
    });
  });

  describe("markNotificationRead", () => {
    it("segna come letta una notifica dell'utente e ritorna true", async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 1 });

      const result = await markNotificationRead(prismaClient, {
        id: 1,
        userId: "user-1",
      });

      expect(result).toBe(true);
      expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 1, userId: "user-1" },
        data: { read: true },
      });
    });

    it("non aggiorna nulla (ritorna false) se l'id appartiene a un altro utente", async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 0 });

      const result = await markNotificationRead(prismaClient, {
        id: 1,
        userId: "someone-else",
      });

      expect(result).toBe(false);
    });
  });

  describe("markAllNotificationsRead", () => {
    it("segna come lette tutte le notifiche non lette dell'utente e ritorna il conteggio", async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 4 });

      const result = await markAllNotificationsRead(prismaClient, "user-1");

      expect(result).toBe(4);
      expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", read: false },
        data: { read: true },
      });
    });
  });

  describe("deleteOldReadNotifications", () => {
    it("cancella solo le notifiche LETTE più vecchie della retention, scopate all'utente", async () => {
      prismaMock.notification.deleteMany.mockResolvedValue({ count: 2 });

      const result = await deleteOldReadNotifications(prismaClient, "user-1");

      expect(result).toBe(2);
      expect(prismaMock.notification.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          read: true,
          createdAt: { lt: expect.any(Date) },
        },
      });
      const call = prismaMock.notification.deleteMany.mock.calls[0][0];
      const createdAtFilter = call?.where?.createdAt as { lt: Date };
      const cutoff = createdAtFilter.lt;
      const expectedCutoff = new Date();
      expectedCutoff.setDate(
        expectedCutoff.getDate() - READ_NOTIFICATION_RETENTION_DAYS
      );
      // Tolleranza di qualche secondo (tempo di esecuzione del test), non un
      // confronto esatto al millisecondo.
      expect(
        Math.abs(cutoff.getTime() - expectedCutoff.getTime())
      ).toBeLessThan(5000);
    });
  });

  describe("listNotificationsForUser", () => {
    it("ritorna un array vuoto senza altre query se l'utente non ha notifiche", async () => {
      prismaMock.notification.findMany.mockResolvedValue([]);

      const result = await listNotificationsForUser(prismaClient, {
        userId: "user-1",
      });

      expect(result).toEqual([]);
      expect(prismaMock.action.findMany).not.toHaveBeenCalled();
      expect(prismaMock.character.findMany).not.toHaveBeenCalled();
      expect(prismaMock.campaign.findMany).not.toHaveBeenCalled();
    });

    it("risolve una notifica missive diretta a un PG (mittente e destinatario reali)", async () => {
      prismaMock.notification.findMany.mockResolvedValue([
        mockNotification({
          id: 1,
          type: NotificationType.missive,
          entityId: 100,
        }),
      ]);
      prismaMock.action.findMany.mockResolvedValueOnce([
        {
          ...mockAction({
            id: 100,
            characterId: 10,
            actionData: {
              subject: "Un avviso",
              description: "Ciao",
              receiverCharacterId: 20,
            },
          }),
          character: { id: 10, name: "Aldric", avatar: "aldric.png" },
        },
      ] as never);
      prismaMock.character.findMany.mockResolvedValueOnce([
        { id: 20, name: "Berith" },
      ] as never);
      prismaMock.campaign.findMany.mockResolvedValue([
        { id: 1, name: "La mia campagna", slug: "la-mia-campagna", logo: null },
      ] as never);

      const [item] = await listNotificationsForUser(prismaClient, {
        userId: "user-1",
      });

      expect(item).toMatchObject({
        id: 1,
        type: "missive",
        actionId: 100,
        subject: "Un avviso",
        isCommunication: false,
        isReply: false,
        isMasterReceiver: false,
        senderName: "Aldric",
        senderAvatar: "aldric.png",
        receiverCharacterName: "Berith",
        campaignSlug: "la-mia-campagna",
        campaignName: "La mia campagna",
      });
    });

    it("risolve una Comunicazione con type missive: senderName generico, nessun destinatario", async () => {
      prismaMock.notification.findMany.mockResolvedValue([
        mockNotification({
          id: 2,
          type: NotificationType.missive,
          entityId: 200,
        }),
      ]);
      prismaMock.action.findMany.mockResolvedValueOnce([
        {
          ...mockAction({
            id: 200,
            characterId: null,
            actionData: {
              subject: "Avviso a tutti",
              description: "Ciao a tutti",
              communication: true,
              readByCharacterIds: [],
            },
          }),
          character: null,
        },
      ] as never);
      prismaMock.campaign.findMany.mockResolvedValue([
        { id: 1, name: "La mia campagna", slug: "la-mia-campagna", logo: null },
      ] as never);

      const [item] = await listNotificationsForUser(prismaClient, {
        userId: "user-1",
      });

      expect(item).toMatchObject({
        type: "missive",
        isCommunication: true,
        senderName: MISSIVE_COMMUN_TEXT,
        receiverCharacterName: null,
      });
      // Comunicazione: nessun `receiverCharacterId` nell'actionData, quindi
      // il lookup dei destinatari non deve nemmeno partire.
      expect(prismaMock.character.findMany).not.toHaveBeenCalled();
    });

    it("risolve una missiva 'a nome del master' senza mai esporre l'identità reale del master", async () => {
      prismaMock.notification.findMany.mockResolvedValue([
        mockNotification({
          id: 3,
          type: NotificationType.missive,
          entityId: 300,
        }),
      ]);
      prismaMock.action.findMany.mockResolvedValueOnce([
        {
          ...mockAction({
            id: 300,
            characterId: null,
            authorUserId: "master-1",
            actionData: {
              subject: "Ordini",
              description: "Fai questo",
              receiverCharacterId: 20,
            },
          }),
          character: null,
        },
      ] as never);
      prismaMock.character.findMany.mockResolvedValueOnce([
        { id: 20, name: "Berith" },
      ] as never);
      prismaMock.campaign.findMany.mockResolvedValue([
        { id: 1, name: "La mia campagna", slug: "la-mia-campagna", logo: null },
      ] as never);

      const [item] = await listNotificationsForUser(prismaClient, {
        userId: "user-1",
      });

      expect(item).toMatchObject({
        senderName: MISSIVE_MASTER_TEXT,
        receiverCharacterName: "Berith",
      });
    });

    it("risolve una notifica character_status", async () => {
      prismaMock.notification.findMany.mockResolvedValue([
        mockNotification({
          id: 4,
          userId: "master-1",
          type: NotificationType.character_status,
          entityId: 30,
        }),
      ]);
      prismaMock.character.findMany.mockResolvedValueOnce([
        {
          ...mockCharacter({
            id: 30,
            name: "Nuovo PG",
            type: CharacterType.pg,
          }),
          user: { name: "Mario Rossi" },
        },
      ] as never);
      prismaMock.campaign.findMany.mockResolvedValue([
        { id: 1, name: "La mia campagna", slug: "la-mia-campagna", logo: null },
      ] as never);

      const [item] = await listNotificationsForUser(prismaClient, {
        userId: "master-1",
      });

      expect(item).toMatchObject({
        type: "character_status",
        characterId: 30,
        characterName: "Nuovo PG",
        characterType: CharacterType.pg,
        ownerUserName: "Mario Rossi",
        // Destinatario ("master-1") diverso dal proprietario del PG
        // (`mockCharacter` di default: "user-1") — notifica di fan-out "nuovo
        // PG in review", non di cambio-stato.
        isOwner: false,
        status: "approved",
      });
    });

    it("risolve character_status come cambio-stato quando il destinatario è il proprietario del PG", async () => {
      prismaMock.notification.findMany.mockResolvedValue([
        mockNotification({
          id: 6,
          userId: "user-1",
          type: NotificationType.character_status,
          entityId: 31,
        }),
      ]);
      prismaMock.character.findMany.mockResolvedValueOnce([
        {
          ...mockCharacter({
            id: 31,
            userId: "user-1",
            name: "PG del giocatore",
            type: CharacterType.pg,
            parkDate: new Date("2024-06-01"),
          }),
          user: { name: "Mario Rossi" },
        },
      ] as never);
      prismaMock.campaign.findMany.mockResolvedValue([
        { id: 1, name: "La mia campagna", slug: "la-mia-campagna", logo: null },
      ] as never);

      const [item] = await listNotificationsForUser(prismaClient, {
        userId: "user-1",
      });

      expect(item).toMatchObject({
        type: "character_status",
        characterId: 31,
        isOwner: true,
        status: "parked",
      });
    });

    it("risolve una notifica downtime con il nome della categoria", async () => {
      prismaMock.notification.findMany.mockResolvedValue([
        mockNotification({
          id: 5,
          type: NotificationType.downtime,
          entityId: 400,
        }),
      ]);
      prismaMock.action.findMany.mockResolvedValueOnce([
        {
          ...mockAction({
            id: 400,
            characterId: 10,
            actionData: {
              category: "Lavorare",
              subject: "Vado a lavorare",
              description: "...",
            },
          }),
          character: { id: 10, name: "Aldric", avatar: null },
        },
      ] as never);
      prismaMock.campaign.findMany.mockResolvedValue([
        { id: 1, name: "La mia campagna", slug: "la-mia-campagna", logo: null },
      ] as never);

      const [item] = await listNotificationsForUser(prismaClient, {
        userId: "master-1",
      });

      expect(item).toMatchObject({
        type: "downtime",
        actionId: 400,
        characterName: "Aldric",
        categoryName: "Lavorare",
        subject: "Vado a lavorare",
        status: "waiting",
        response: null,
      });
    });

    it("isAuthor=true quando il destinatario è il proprietario del PG autore (T-0xx, cambio stato)", async () => {
      prismaMock.notification.findMany.mockResolvedValue([
        mockNotification({
          id: 5,
          userId: "player-1",
          type: NotificationType.downtime,
          entityId: 400,
        }),
      ]);
      prismaMock.action.findMany.mockResolvedValueOnce([
        {
          ...mockAction({
            id: 400,
            characterId: 10,
            actionData: {
              subject: "Vado a lavorare",
              status: "approve",
              response: "Ottimo lavoro",
            },
          }),
          character: {
            id: 10,
            name: "Aldric",
            avatar: null,
            userId: "player-1",
          },
        },
      ] as never);
      prismaMock.campaign.findMany.mockResolvedValue([
        { id: 1, name: "La mia campagna", slug: "la-mia-campagna", logo: null },
      ] as never);

      const [item] = await listNotificationsForUser(prismaClient, {
        userId: "player-1",
      });

      expect(item).toMatchObject({
        type: "downtime",
        isAuthor: true,
        status: "approve",
        response: "Ottimo lavoro",
      });
    });

    it("isAuthor=false quando il destinatario è un master avvisato della downtime di qualcun altro", async () => {
      prismaMock.notification.findMany.mockResolvedValue([
        mockNotification({
          id: 5,
          userId: "master-1",
          type: NotificationType.downtime,
          entityId: 400,
        }),
      ]);
      prismaMock.action.findMany.mockResolvedValueOnce([
        {
          ...mockAction({
            id: 400,
            characterId: 10,
            actionData: { subject: "Vado a lavorare", status: "waiting" },
          }),
          character: {
            id: 10,
            name: "Aldric",
            avatar: null,
            userId: "player-1",
          },
        },
      ] as never);
      prismaMock.campaign.findMany.mockResolvedValue([
        { id: 1, name: "La mia campagna", slug: "la-mia-campagna", logo: null },
      ] as never);

      const [item] = await listNotificationsForUser(prismaClient, {
        userId: "master-1",
      });

      expect(item).toMatchObject({ type: "downtime", isAuthor: false });
    });

    it("scarta in silenzio una notifica il cui Action referenziato non esiste più", async () => {
      prismaMock.notification.findMany.mockResolvedValue([
        mockNotification({
          id: 6,
          type: NotificationType.missive,
          entityId: 999,
        }),
      ]);
      prismaMock.action.findMany.mockResolvedValueOnce([]);
      prismaMock.campaign.findMany.mockResolvedValue([
        { id: 1, name: "La mia campagna", slug: "la-mia-campagna", logo: null },
      ] as never);

      const result = await listNotificationsForUser(prismaClient, {
        userId: "user-1",
      });

      expect(result).toEqual([]);
    });

    it("scarta in silenzio una notifica il cui Character referenziato non esiste più", async () => {
      prismaMock.notification.findMany.mockResolvedValue([
        mockNotification({
          id: 7,
          type: NotificationType.character_status,
          entityId: 999,
        }),
      ]);
      prismaMock.character.findMany.mockResolvedValueOnce([]);
      prismaMock.campaign.findMany.mockResolvedValue([
        { id: 1, name: "La mia campagna", slug: "la-mia-campagna", logo: null },
      ] as never);

      const result = await listNotificationsForUser(prismaClient, {
        userId: "master-1",
      });

      expect(result).toEqual([]);
    });

    it("risolve una notifica support_new senza campagna (autore = titolare del ticket)", async () => {
      prismaMock.notification.findMany.mockResolvedValue([
        mockNotification({
          id: 8,
          userId: "staff-1",
          type: NotificationType.support_new,
          entityId: 50,
          campaignId: null,
        }),
      ]);
      prismaMock.supportTicket.findMany.mockResolvedValueOnce([
        {
          id: 50,
          subject: "Non riesco ad accedere",
          user: { name: "Mario Rossi" },
          messages: [{ author: { name: "Staff Uno" } }],
        },
      ] as never);

      const [item] = await listNotificationsForUser(prismaClient, {
        userId: "staff-1",
      });

      expect(item).toMatchObject({
        type: "support_new",
        ticketId: 50,
        subject: "Non riesco ad accedere",
        authorName: "Mario Rossi",
      });
      // Nessuna campagna da risolvere per questo tipo.
      expect(prismaMock.campaign.findMany).not.toHaveBeenCalled();
    });

    it("risolve una notifica support_reply con l'autore dell'ultimo messaggio", async () => {
      prismaMock.notification.findMany.mockResolvedValue([
        mockNotification({
          id: 9,
          userId: "user-1",
          type: NotificationType.support_reply,
          entityId: 50,
          campaignId: null,
        }),
      ]);
      prismaMock.supportTicket.findMany.mockResolvedValueOnce([
        {
          id: 50,
          subject: "Non riesco ad accedere",
          user: { name: "Mario Rossi" },
          messages: [{ author: { name: "Staff Uno" } }],
        },
      ] as never);

      const [item] = await listNotificationsForUser(prismaClient, {
        userId: "user-1",
      });

      expect(item).toMatchObject({
        type: "support_reply",
        ticketId: 50,
        authorName: "Staff Uno",
      });
    });

    it("scarta in silenzio una notifica support il cui SupportTicket non esiste più", async () => {
      prismaMock.notification.findMany.mockResolvedValue([
        mockNotification({
          id: 10,
          type: NotificationType.support_new,
          entityId: 999,
          campaignId: null,
        }),
      ]);
      prismaMock.supportTicket.findMany.mockResolvedValueOnce([]);

      const result = await listNotificationsForUser(prismaClient, {
        userId: "staff-1",
      });

      expect(result).toEqual([]);
    });

    it("passa il limit richiesto alla query", async () => {
      prismaMock.notification.findMany.mockResolvedValue([]);

      await listNotificationsForUser(prismaClient, {
        userId: "user-1",
        limit: 10,
      });

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
    });
  });
});
