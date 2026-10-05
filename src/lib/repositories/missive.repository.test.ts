import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@prisma/client";
import {
  MISSIVE_SENDER_MASTER,
  getMissiveByIdScoped,
  getReplyEligibility,
  getThreadReplies,
  listMissivesForCampaign,
  markCommunicationMissiveAsRead,
  markFreeReceiverMissiveAsRead,
  markMissiveAsRead,
  updateMissiveContentIfUnread,
} from "./missive.repository";
import { MISSIVE_MASTER_TEXT } from "@/lib/validations/missive";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import { mockAction } from "@/test/helpers/prisma-fixtures";

const missiveAction = (overrides?: {
  id?: number;
  characterId?: number | null;
  subject?: string;
  receiverCharacterId?: number;
  readDate?: string | null;
}) =>
  mockAction({
    id: overrides?.id ?? 1,
    characterId: overrides?.characterId ?? 10,
    featureId: 7,
    actionData: {
      subject: overrides?.subject ?? "Un avviso",
      description: "<p>Ciao</p>",
      receiverCharacterId: overrides?.receiverCharacterId ?? 99,
      readDate: overrides?.readDate ?? null,
    },
  });

// Comunicazione (T-0xx): `characterId: null` (sempre "a nome del master"),
// nessun `receiverCharacterId`, tracking "letta" via `readByCharacterIds`.
const communicationAction = (overrides?: {
  id?: number;
  subject?: string;
  readByCharacterIds?: number[];
}) =>
  mockAction({
    id: overrides?.id ?? 1,
    characterId: null,
    featureId: 7,
    actionData: {
      subject: overrides?.subject ?? "Avviso a tutti",
      description: "<p>Ciao a tutti</p>",
      communication: true,
      readByCharacterIds: overrides?.readByCharacterIds ?? [],
    },
  });

// Campo libero (T-0xx): `characterId` è quello del PG mittente (o `null` se
// inviata "a nome del master", stesso pattern del ramo reale — a differenza
// della Comunicazione, che è sempre `characterId: null`), niente
// `receiverCharacterId`, tracking "letta" via il singolo `readDate` (come
// il ramo reale, non un array per-PG).
const freeReceiverAction = (overrides?: {
  id?: number;
  characterId?: number | null;
  subject?: string;
  receiverFreeText?: string;
  readDate?: string | null;
}) =>
  mockAction({
    id: overrides?.id ?? 1,
    characterId:
      overrides?.characterId === undefined ? 10 : overrides.characterId,
    featureId: 7,
    actionData: {
      subject: overrides?.subject ?? "Un avviso al taverniere",
      description: "<p>Ciao</p>",
      receiverFreeText: overrides?.receiverFreeText ?? "Il taverniere",
      readDate: overrides?.readDate ?? null,
    },
  });

describe("missive.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listMissivesForCampaign", () => {
    it("applies no character scoping for a master viewer", async () => {
      prismaMock.action.findMany.mockResolvedValue([]);

      await listMissivesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: {
          isMaster: true,
          ownCharacterIds: [],
          userId: "master-1",
        },
      });

      expect(prismaMock.action.findMany).toHaveBeenCalledTimes(2);
      const [call] = prismaMock.action.findMany.mock.calls;
      expect(call[0].where).toEqual({
        feature: { campaignId: 1, featureType: { functionName: "missive" } },
      });
    });

    it("scopes to sent-or-received-by-own-characters for a non-master viewer", async () => {
      prismaMock.action.findMany.mockResolvedValue([]);

      await listMissivesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: {
          isMaster: false,
          characterIds: [10, 11],
          hasActiveCharacter: false,
        },
      });

      const [call] = prismaMock.action.findMany.mock.calls;
      expect(call[0].where).toEqual({
        feature: { campaignId: 1, featureType: { functionName: "missive" } },
        OR: [
          { characterId: { in: [10, 11] } },
          { actionData: { path: ["receiverCharacterId"], equals: 10 } },
          { actionData: { path: ["receiverCharacterId"], equals: 11 } },
        ],
      });
    });

    it("excludes everything for a non-master viewer with no character at all", async () => {
      prismaMock.action.findMany.mockResolvedValue([]);

      await listMissivesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: {
          isMaster: false,
          characterIds: [],
          hasActiveCharacter: false,
        },
      });

      const [call] = prismaMock.action.findMany.mock.calls;
      expect(call[0].where).toMatchObject({ OR: [{ id: -1 }] });
    });

    it("adds the communication condition to the OR when the viewer has an active character", async () => {
      prismaMock.action.findMany.mockResolvedValue([]);

      await listMissivesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: {
          isMaster: false,
          characterIds: [10],
          hasActiveCharacter: true,
        },
      });

      const [call] = prismaMock.action.findMany.mock.calls;
      expect(call[0].where).toEqual({
        feature: { campaignId: 1, featureType: { functionName: "missive" } },
        OR: [
          { characterId: { in: [10] } },
          { actionData: { path: ["receiverCharacterId"], equals: 10 } },
          { actionData: { path: ["communication"], equals: true } },
        ],
      });
    });

    it("excludes communications from the OR when the viewer has no active character, even with characters", async () => {
      prismaMock.action.findMany.mockResolvedValue([]);

      await listMissivesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: {
          isMaster: false,
          characterIds: [10],
          hasActiveCharacter: false,
        },
      });

      const [call] = prismaMock.action.findMany.mock.calls;
      expect(call[0].where).toEqual({
        feature: { campaignId: 1, featureType: { functionName: "missive" } },
        OR: [
          { characterId: { in: [10] } },
          { actionData: { path: ["receiverCharacterId"], equals: 10 } },
        ],
      });
    });

    it("applies the sender filter, mapping the master sentinel to characterId: null, excluding Comunicazioni NULL-safely (bug reale pre-esistente)", async () => {
      prismaMock.action.findMany.mockResolvedValue([]);

      await listMissivesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: {
          isMaster: true,
          ownCharacterIds: [],
          userId: "master-1",
        },
        filters: { senderCharacterId: MISSIVE_SENDER_MASTER },
      });

      const [call] = prismaMock.action.findMany.mock.calls;
      // `NOT: { actionData: { path: ["communication"], not: Prisma.DbNull } }`,
      // non `NOT: { actionData: { path: [...], equals: true } } }`: la
      // vecchia forma escludeva SEMPRE ogni riga (semantica NULL a tre
      // valori di SQL su una chiave quasi mai presente), verificato contro
      // Postgres reale — il filtro "Mittente = Master" non restituiva mai
      // un solo risultato.
      expect(call[0].where).toMatchObject({
        characterId: null,
        NOT: {
          actionData: { path: ["communication"], not: Prisma.DbNull },
        },
      });
    });

    it("applies receiver and date-range filters independently", async () => {
      prismaMock.action.findMany.mockResolvedValue([]);

      await listMissivesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: {
          isMaster: true,
          ownCharacterIds: [],
          userId: "master-1",
        },
        filters: {
          receiverCharacterId: 42,
          dateFrom: new Date("2024-01-01"),
        },
      });

      const [call] = prismaMock.action.findMany.mock.calls;
      expect(call[0].where).toMatchObject({
        actionData: { path: ["receiverCharacterId"], equals: 42 },
        creationDate: { gte: new Date("2024-01-01") },
      });
    });

    it("filters in-memory by search on subject, sender character name and player name", async () => {
      const target = {
        ...missiveAction({ id: 1, subject: "Attacco a sorpresa" }),
        character: {
          id: 10,
          name: "Aldric",
          avatar: null,
          user: { name: "Mario Rossi" },
        },
      };
      const other = {
        ...missiveAction({ id: 2, subject: "Rifornimenti" }),
        character: {
          id: 11,
          name: "Berith",
          avatar: null,
          user: { name: "Luigi Verdi" },
        },
      };
      prismaMock.action.findMany.mockResolvedValueOnce([target, other]);
      prismaMock.action.findMany.mockResolvedValueOnce([]);

      const result = await listMissivesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: {
          isMaster: true,
          ownCharacterIds: [],
          userId: "master-1",
        },
        filters: { search: "sorpresa" },
      });

      // Nessun Character mockato con id 99 (default di `missiveAction`),
      // quindi `receiver` risolve sempre a `null` qui — non è quello che la
      // suite verifica (il filtro `search`), solo l'arricchimento atteso
      // dall'implementazione. `readDate` è `null` di default (mai
      // valorizzato in `missiveAction`).
      const { creationDate, ...targetRest } = target;
      expect(result.missives).toEqual([
        {
          ...targetRest,
          sendDate: creationDate,
          receiver: null,
          readDate: null,
          isCommunication: false,
          isFreeReceiver: false,
          isMasterReceiver: false,
          receiverFreeText: null,
          readByCharacters: [],
          // `character` presente (mittente PG reale): mai un master sender.
          masterSenderName: null,
          isReply: false,
          threadRootId: null,
        },
      ]);
    });

    it("paginates AFTER the in-memory search filter, not before", async () => {
      // 5 righe totali, 3 combaciano con "cerca": la paginazione (page 1,
      // pageSize 2) deve tagliare sulle 3 filtrate, non sulle 5 grezze —
      // altrimenti rischierebbe di restituire una pagina con righe che non
      // avrebbero dovuto superare il filtro `search`, o di perderne alcune
      // che lo superano ma che il taglio "grezzo" avrebbe già escluso.
      const matching = [1, 2, 3].map(id =>
        missiveAction({ id, subject: `cerca ${id}` })
      );
      const nonMatching = [4, 5].map(id =>
        missiveAction({ id, subject: `altro ${id}` })
      );
      prismaMock.action.findMany.mockResolvedValueOnce([
        ...matching,
        ...nonMatching,
      ]);
      prismaMock.action.findMany.mockResolvedValueOnce([]);

      const result = await listMissivesForCampaign(prismaClient, {
        campaignId: 1,
        page: 2,
        pageSize: 2,
        viewer: {
          isMaster: true,
          ownCharacterIds: [],
          userId: "master-1",
        },
        filters: { search: "cerca" },
      });

      expect(result.missives.map(m => m.id)).toEqual([3]);
      expect(result.pagination).toEqual({
        page: 2,
        pageSize: 2,
        totalCount: 3,
        totalPages: 2,
      });
    });

    // Comunicazione (T-0xx, chiarimento post-fix): sta SEMPRE in "Posta in
    // arrivo" per QUALSIASI viewer, incluso un master che l'ha scritta lui
    // stesso "a nome del master" — mai in "Inviate", nemmeno per il master
    // che ne è l'autore.
    it("box 'sent' for a master viewer excludes Comunicazioni even though they have characterId: null (master-authored)", async () => {
      prismaMock.action.findMany.mockResolvedValue([]);

      await listMissivesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: {
          isMaster: true,
          ownCharacterIds: [],
          userId: "master-1",
        },
        filters: { box: "sent" },
      });

      const [call] = prismaMock.action.findMany.mock.calls;
      // `NOT: { actionData: { path: [...], not: Prisma.DbNull } }`, non
      // `NOT: { actionData: { path: [...], equals: true } } }`: quest'ultima
      // forma esclude SEMPRE ogni riga con `characterId: null` (semantica
      // NULL a tre valori di SQL su una chiave quasi mai presente),
      // verificato contro Postgres reale — bug reale trovato in produzione,
      // non solo teoria. `authorUserId: viewer.userId` (T-0xx, scenario
      // Marco/Pippo): il ramo "a nome del master" si restringe al viewer
      // stesso.
      expect(call[0].where).toEqual({
        feature: { campaignId: 1, featureType: { functionName: "missive" } },
        OR: [
          {
            characterId: null,
            authorUserId: "master-1",
            NOT: {
              actionData: { path: ["communication"], not: Prisma.DbNull },
            },
          },
          { characterId: { in: [] } },
        ],
      });
    });

    // Scenario reale segnalato dall'utente: Marco e Pippo scrivono entrambi
    // "a nome del master" allo stesso PG — in "Inviate" ciascuno deve vedere
    // SOLO la propria, mai quella dell'altro master (verificato qui a
    // livello di `where` costruita: la `authorUserId` cambia col viewer,
    // non con l'insieme di dati sottostante).
    it("box 'sent' for master Marco restricts authorUserId to himself, different from master Pippo's id", async () => {
      prismaMock.action.findMany.mockResolvedValue([]);

      await listMissivesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: {
          isMaster: true,
          ownCharacterIds: [],
          userId: "marco-id",
        },
        filters: { box: "sent" },
      });

      const [call] = prismaMock.action.findMany.mock.calls;
      expect(call[0].where).toMatchObject({
        OR: [
          expect.objectContaining({
            characterId: null,
            authorUserId: "marco-id",
          }),
          { characterId: { in: [] } },
        ],
      });
      expect(call[0].where.OR[0].authorUserId).not.toBe("pippo-id");
    });

    // Bug reale osservato in produzione (super-admin `mattia@arcana.it` con
    // un proprio PG "Basilio" nella campagna: la sua missiva inviata da
    // Basilio compariva erroneamente in "Posta in arrivo" invece che
    // "Inviate"): un master PUÒ possedere anche un PG reale nella stessa
    // campagna — `ownCharacterIds` deve essere considerato, non solo
    // `characterId === null`.
    it("box 'sent' for a master viewer WITH an own character includes missives authored by that character too", async () => {
      prismaMock.action.findMany.mockResolvedValue([]);

      await listMissivesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: {
          isMaster: true,
          ownCharacterIds: [99],
          userId: "master-1",
        },
        filters: { box: "sent" },
      });

      const [call] = prismaMock.action.findMany.mock.calls;
      expect(call[0].where).toEqual({
        feature: { campaignId: 1, featureType: { functionName: "missive" } },
        OR: [
          {
            characterId: null,
            authorUserId: "master-1",
            NOT: {
              actionData: { path: ["communication"], not: Prisma.DbNull },
            },
          },
          { characterId: { in: [99] } },
        ],
      });
    });

    // Nuovo asse "Posta in arrivo" per un master (chiarimento post-fix): CHI
    // RICEVE, non CHI SCRIVE — una missiva scritta da un ALTRO giocatore ma
    // NON indirizzata a un personaggio del master non compare più
    // nell'inbox del master (prima ci compariva sempre, ora compare solo in
    // `box: "all"`). La condizione Comunicazione resta comunque SEMPRE
    // presente (regola prodotto aggiornata, T-0xx: uno staff di campagna
    // vede sempre gli annunci broadcast, nessun gate su personaggi attivi —
    // `MissiveViewer` per un master non porta più `hasActiveCharacter`),
    // anche senza alcun personaggio proprio in questa campagna: niente più
    // sentinel `{ id: -1 }` per questo caso, l'`OR` non è mai vuoto.
    it("box 'inbox' for a master viewer with no own character matches only the Comunicazione condition (no receiverCharacterId condition to add, no sentinel)", async () => {
      prismaMock.action.findMany.mockResolvedValue([]);

      await listMissivesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: {
          isMaster: true,
          ownCharacterIds: [],
          userId: "master-1",
        },
        filters: { box: "inbox" },
      });

      const [call] = prismaMock.action.findMany.mock.calls;
      expect(call[0].where).toEqual({
        feature: { campaignId: 1, featureType: { functionName: "missive" } },
        OR: [{ actionData: { path: ["communication"], equals: true } }],
      });
    });

    it("box 'inbox' for a master viewer WITH an own character matches the Comunicazione condition OR missives addressed to that character (not missives authored by others in general)", async () => {
      prismaMock.action.findMany.mockResolvedValue([]);

      await listMissivesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: {
          isMaster: true,
          ownCharacterIds: [99],
          userId: "master-1",
        },
        filters: { box: "inbox" },
      });

      const [call] = prismaMock.action.findMany.mock.calls;
      expect(call[0].where).toEqual({
        feature: { campaignId: 1, featureType: { functionName: "missive" } },
        OR: [
          { actionData: { path: ["communication"], equals: true } },
          { actionData: { path: ["receiverCharacterId"], equals: 99 } },
        ],
      });
    });

    // `box: "all"` (terza tab, master-only in UI): nessun filtro di
    // direzione aggiuntivo oltre alla visibilità già applicata da
    // `buildVisibilityWhere` — per un master quest'ultima è `{}` (nessuna
    // restrizione), quindi `where` è identico al caso "nessun box" (stesso
    // trattamento di `box === undefined`).
    it("box 'all' for a master viewer applies no extra direction filter (sees everything, including traffic between other players)", async () => {
      prismaMock.action.findMany.mockResolvedValue([]);

      await listMissivesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: {
          isMaster: true,
          ownCharacterIds: [99],
          userId: "master-1",
        },
        filters: { box: "all" },
      });

      const [call] = prismaMock.action.findMany.mock.calls;
      expect(call[0].where).toEqual({
        feature: { campaignId: 1, featureType: { functionName: "missive" } },
      });
    });

    // Scenario reale segnalato dall'utente (Marco/Pippo): in "Tutte le
    // missive" un master vede lo username dell'autore accanto a "Master";
    // un giocatore, sulla STESSA riga sottostante, non lo vede mai.
    it("masterSenderName is populated for a master viewer in box:'all', always null for a player viewer on the same row", async () => {
      const masterAuthoredRow = {
        ...missiveAction({ id: 1, characterId: null }),
        character: null,
        author: { name: "Marco Verdi" },
      };
      prismaMock.action.findMany.mockResolvedValueOnce([masterAuthoredRow]);
      prismaMock.action.findMany.mockResolvedValueOnce([]);

      const masterResult = await listMissivesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: {
          isMaster: true,
          ownCharacterIds: [],
          userId: "master-1",
        },
        filters: { box: "all" },
      });
      expect(masterResult.missives[0].masterSenderName).toBe("Marco Verdi");

      prismaMock.action.findMany.mockResolvedValueOnce([masterAuthoredRow]);
      prismaMock.action.findMany.mockResolvedValueOnce([]);

      const playerResult = await listMissivesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: {
          isMaster: false,
          characterIds: [10],
          hasActiveCharacter: false,
        },
      });
      expect(playerResult.missives[0].masterSenderName).toBeNull();
    });

    // Il resolver deve escludere la Comunicazione esplicitamente via
    // `isCommunicationMissive`, non solo per assenza di `author`: qui
    // `author` è presente per costruzione, eppure `masterSenderName` resta
    // `null` per un viewer master.
    it("masterSenderName is always null for a Comunicazione, even with an author present", async () => {
      const communicationWithAuthor = {
        ...communicationAction({ id: 1 }),
        character: null,
        author: { name: "Marco Verdi" },
      };
      prismaMock.action.findMany.mockResolvedValueOnce([
        communicationWithAuthor,
      ]);
      prismaMock.action.findMany.mockResolvedValueOnce([]);

      const result = await listMissivesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: {
          isMaster: true,
          ownCharacterIds: [],
          userId: "master-1",
        },
        filters: { box: "all" },
      });

      expect(result.missives[0].isCommunication).toBe(true);
      expect(result.missives[0].masterSenderName).toBeNull();
    });

    it("box 'sent' for a player viewer matches only missives authored by one of their own characters", async () => {
      prismaMock.action.findMany.mockResolvedValue([]);

      await listMissivesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: {
          isMaster: false,
          characterIds: [10, 11],
          hasActiveCharacter: true,
        },
        filters: { box: "sent" },
      });

      const [call] = prismaMock.action.findMany.mock.calls;
      expect(call[0].where).toEqual({
        feature: { campaignId: 1, featureType: { functionName: "missive" } },
        OR: [
          { characterId: { in: [10, 11] } },
          { actionData: { path: ["receiverCharacterId"], equals: 10 } },
          { actionData: { path: ["receiverCharacterId"], equals: 11 } },
          { actionData: { path: ["communication"], equals: true } },
        ],
        characterId: { in: [10, 11] },
      });
    });

    it("box 'inbox' for a player viewer excludes missives authored by their own characters but keeps received ones and Comunicazioni", async () => {
      prismaMock.action.findMany.mockResolvedValue([]);

      await listMissivesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: {
          isMaster: false,
          characterIds: [10, 11],
          hasActiveCharacter: true,
        },
        filters: { box: "inbox" },
      });

      const [call] = prismaMock.action.findMany.mock.calls;
      // `AND: [{ OR: [...] }]`, non `NOT: { characterId: { in: [...] } } }`
      // né `characterId: { notIn: [...] } }`: la semantica NULL a tre valori
      // di SQL esclude sempre una riga `characterId NULL` da un `<>`/`NOT IN`
      // (verificato contro Postgres) — una Comunicazione o una missiva "a
      // nome del master" (entrambe `characterId: null`) andrebbero perse
      // dall'inbox. L'`OR` esplicito va innestato sotto `AND`, non un `OR`
      // top-level, per non sovrascrivere quello di visibilità (stessa
      // chiave, l'ultimo spread vince).
      expect(call[0].where).toEqual({
        feature: { campaignId: 1, featureType: { functionName: "missive" } },
        OR: [
          { characterId: { in: [10, 11] } },
          { actionData: { path: ["receiverCharacterId"], equals: 10 } },
          { actionData: { path: ["receiverCharacterId"], equals: 11 } },
          { actionData: { path: ["communication"], equals: true } },
        ],
        AND: [
          {
            OR: [{ characterId: null }, { characterId: { notIn: [10, 11] } }],
          },
        ],
      });
    });

    it("builds sender/receiver filter options from the visible set, ignoring other filters", async () => {
      prismaMock.action.findMany
        .mockResolvedValueOnce([]) // lista principale (filtrata)
        .mockResolvedValueOnce([
          {
            actionData: { receiverCharacterId: 20 },
            character: { id: 10, name: "Aldric", avatar: null },
          },
          {
            actionData: { receiverCharacterId: 21 },
            character: null, // missiva "a nome del master"
          },
        ] as never);
      prismaMock.character.findMany.mockResolvedValue([
        {
          id: 20,
          name: "Aurelio",
          avatar: "url-a",
          user: { name: "Player A" },
        },
        { id: 21, name: "Berith", avatar: null, user: { name: "Player B" } },
      ] as never);

      const result = await listMissivesForCampaign(prismaClient, {
        campaignId: 1,
        page: 1,
        pageSize: 25,
        viewer: {
          isMaster: true,
          ownCharacterIds: [],
          userId: "master-1",
        },
        filters: { search: "qualunque cosa" },
      });

      expect(result.filterOptions).toEqual({
        senders: [
          { id: 10, name: "Aldric", avatar: null },
          {
            id: MISSIVE_SENDER_MASTER,
            name: MISSIVE_MASTER_TEXT,
            avatar: null,
          },
        ],
        receivers: [
          { id: 20, name: "Aurelio", avatar: "url-a" },
          { id: 21, name: "Berith", avatar: null },
        ],
      });
    });
  });

  describe("getMissiveByIdScoped", () => {
    it("returns null when the missive does not exist or is not visible (findFirst resolves null)", async () => {
      prismaMock.action.findFirst.mockResolvedValue(null);

      const result = await getMissiveByIdScoped(prismaClient, {
        campaignId: 1,
        actionId: 999,
        viewer: {
          isMaster: false,
          characterIds: [10],
          hasActiveCharacter: false,
        },
      });

      expect(result).toBeNull();
      expect(prismaMock.action.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 999,
            feature: {
              campaignId: 1,
              featureType: { functionName: "missive" },
            },
            OR: [
              { characterId: { in: [10] } },
              {
                actionData: { path: ["receiverCharacterId"], equals: 10 },
              },
            ],
          },
        })
      );
      // Nessuna missiva trovata: nessun bisogno di risolvere il
      // destinatario, quindi nessuna query sui Character della campagna.
      expect(prismaMock.character.findMany).not.toHaveBeenCalled();
    });

    it("returns the missive with its sender and resolved receiver when found and visible", async () => {
      const found = {
        ...missiveAction({ id: 1, receiverCharacterId: 20 }),
        character: {
          id: 10,
          name: "Aldric",
          avatar: null,
          user: { name: "Mario Rossi" },
        },
      };
      prismaMock.action.findFirst.mockResolvedValue(found);
      prismaMock.character.findMany.mockResolvedValue([
        {
          id: 20,
          name: "Aurelio",
          avatar: "url-a",
          type: "pg",
          user: { name: "Player Aurelio" },
        },
      ] as never);

      const result = await getMissiveByIdScoped(prismaClient, {
        campaignId: 1,
        actionId: 1,
        viewer: {
          isMaster: true,
          ownCharacterIds: [],
          userId: "master-1",
        },
      });

      expect(result?.id).toBe(1);
      expect(result?.character?.name).toBe("Aldric");
      expect(result?.receiver).toEqual({
        id: 20,
        name: "Aurelio",
        avatar: "url-a",
        userName: "Player Aurelio",
        type: "pg",
      });
    });

    // `MissiveReader` (pagina di dettaglio): stesso username accanto a
    // "Master" indipendentemente da quale tab ha portato lì il viewer, mai
    // per un giocatore che apra la stessa missiva per id diretto.
    it("exposes masterSenderName for a master-authored missive to a master viewer, always null for a player viewer", async () => {
      const found = {
        ...missiveAction({ id: 1, characterId: null, receiverCharacterId: 20 }),
        character: null,
        author: { name: "Marco Verdi" },
      };
      prismaMock.action.findFirst.mockResolvedValue(found);
      prismaMock.character.findMany.mockResolvedValue([
        {
          id: 20,
          name: "Aurelio",
          avatar: "url-a",
          type: "pg",
          user: { name: "Player Aurelio" },
        },
      ] as never);

      const masterResult = await getMissiveByIdScoped(prismaClient, {
        campaignId: 1,
        actionId: 1,
        viewer: {
          isMaster: true,
          ownCharacterIds: [],
          userId: "master-1",
        },
      });
      expect(masterResult?.masterSenderName).toBe("Marco Verdi");

      prismaMock.action.findFirst.mockResolvedValue(found);
      const playerResult = await getMissiveByIdScoped(prismaClient, {
        campaignId: 1,
        actionId: 1,
        viewer: {
          isMaster: false,
          characterIds: [20],
          hasActiveCharacter: true,
        },
      });
      expect(playerResult?.masterSenderName).toBeNull();
    });

    it("resolves receiver to null when the receiving character no longer exists", async () => {
      const found = {
        ...missiveAction({ id: 1, receiverCharacterId: 20 }),
        character: null,
      };
      prismaMock.action.findFirst.mockResolvedValue(found);
      prismaMock.character.findMany.mockResolvedValue([]);

      const result = await getMissiveByIdScoped(prismaClient, {
        campaignId: 1,
        actionId: 1,
        viewer: {
          isMaster: true,
          ownCharacterIds: [],
          userId: "master-1",
        },
      });

      expect(result?.receiver).toBeNull();
    });

    it("resolves readDate from actionData when the missive has already been read", async () => {
      const found = {
        ...missiveAction({
          id: 1,
          receiverCharacterId: 20,
          readDate: "2024-03-01T10:00:00.000Z",
        }),
        character: null,
      };
      prismaMock.action.findFirst.mockResolvedValue(found);
      prismaMock.character.findMany.mockResolvedValue([
        {
          id: 20,
          name: "Aurelio",
          avatar: null,
          type: "pg",
          user: { name: "Player" },
        },
      ] as never);

      const result = await getMissiveByIdScoped(prismaClient, {
        campaignId: 1,
        actionId: 1,
        viewer: {
          isMaster: true,
          ownCharacterIds: [],
          userId: "master-1",
        },
      });

      expect(result?.readDate).toEqual(new Date("2024-03-01T10:00:00.000Z"));
    });
  });

  describe("getMissiveByIdScoped — comunicazione", () => {
    it("resolves receiver to null and isCommunication to true, never 'personaggio eliminato'", async () => {
      prismaMock.action.findFirst.mockResolvedValue(communicationAction());
      prismaMock.character.findMany.mockResolvedValue([]);

      const result = await getMissiveByIdScoped(prismaClient, {
        campaignId: 1,
        actionId: 1,
        viewer: {
          isMaster: true,
          ownCharacterIds: [],
          userId: "master-1",
        },
      });

      expect(result?.isCommunication).toBe(true);
      expect(result?.receiver).toBeNull();
    });

    it("exposes readByCharacters (resolved) only to a master viewer", async () => {
      prismaMock.action.findFirst.mockResolvedValue(
        communicationAction({ readByCharacterIds: [20] })
      );
      prismaMock.character.findMany.mockResolvedValue([
        {
          id: 20,
          name: "Aurelio",
          avatar: null,
          type: "pg",
          user: { name: "Player Aurelio" },
        },
      ] as never);

      const masterResult = await getMissiveByIdScoped(prismaClient, {
        campaignId: 1,
        actionId: 1,
        viewer: {
          isMaster: true,
          ownCharacterIds: [],
          userId: "master-1",
        },
      });
      expect(masterResult?.readByCharacters).toEqual([
        {
          id: 20,
          name: "Aurelio",
          avatar: null,
          userName: "Player Aurelio",
          type: "pg",
        },
      ]);

      prismaMock.action.findFirst.mockResolvedValue(
        communicationAction({ readByCharacterIds: [20] })
      );
      const playerResult = await getMissiveByIdScoped(prismaClient, {
        campaignId: 1,
        actionId: 1,
        viewer: {
          isMaster: false,
          characterIds: [20],
          hasActiveCharacter: true,
        },
      });
      expect(playerResult?.readByCharacters).toEqual([]);
    });

    it("resolves readDate as 'read by this viewer' for a non-master viewer, not an aggregate", async () => {
      prismaMock.action.findFirst.mockResolvedValue(
        communicationAction({ readByCharacterIds: [20] })
      );
      prismaMock.character.findMany.mockResolvedValue([]);

      // Il PG del viewer (30) non è fra quelli che hanno letto (solo 20):
      // per QUESTO viewer non è "letta", anche se lo è per qualcun altro.
      const result = await getMissiveByIdScoped(prismaClient, {
        campaignId: 1,
        actionId: 1,
        viewer: {
          isMaster: false,
          characterIds: [30],
          hasActiveCharacter: true,
        },
      });

      expect(result?.readDate).toBeNull();
    });

    it("resolves readDate personally for a master who owns a character, not as an aggregate", async () => {
      prismaMock.action.findFirst.mockResolvedValue(
        communicationAction({ readByCharacterIds: [20] })
      );
      prismaMock.character.findMany.mockResolvedValue([]);

      // Il PG del master (30) non è fra quelli che hanno letto (solo 20):
      // per QUESTO master non è "letta", anche se lo è per un altro PG —
      // avere un proprio PG nella campagna non deve far tornare
      // all'aggregato "letta da chiunque".
      const result = await getMissiveByIdScoped(prismaClient, {
        campaignId: 1,
        actionId: 1,
        viewer: {
          isMaster: true,
          ownCharacterIds: [30],
          userId: "master-1",
        },
      });

      expect(result?.readDate).toBeNull();
    });

    it("falls back to the aggregate for a master with no character of their own", async () => {
      prismaMock.action.findFirst.mockResolvedValue(
        communicationAction({ readByCharacterIds: [20] })
      );
      prismaMock.character.findMany.mockResolvedValue([]);

      // Nessun modo personale di comparire in `readByCharacterIds` per un
      // master senza alcun PG: l'aggregato resta l'unico segnale utile.
      const result = await getMissiveByIdScoped(prismaClient, {
        campaignId: 1,
        actionId: 1,
        viewer: {
          isMaster: true,
          ownCharacterIds: [],
          userId: "master-1",
        },
      });

      expect(result?.readDate).not.toBeNull();
    });
  });

  describe("getMissiveByIdScoped — campo libero", () => {
    it("resolves isFreeReceiver to true and receiver to null, with the free text exposed", async () => {
      prismaMock.action.findFirst.mockResolvedValue(freeReceiverAction());
      prismaMock.character.findMany.mockResolvedValue([]);

      const result = await getMissiveByIdScoped(prismaClient, {
        campaignId: 1,
        actionId: 1,
        viewer: {
          isMaster: true,
          ownCharacterIds: [],
          userId: "master-1",
        },
      });

      expect(result?.isFreeReceiver).toBe(true);
      expect(result?.isCommunication).toBe(false);
      expect(result?.receiver).toBeNull();
      expect(result?.receiverFreeText).toBe("Il taverniere");
    });

    it("a master viewer sees a free-receiver missive sent by another PG", async () => {
      prismaMock.action.findFirst.mockResolvedValue(
        freeReceiverAction({ characterId: 10 })
      );
      prismaMock.character.findMany.mockResolvedValue([]);

      const result = await getMissiveByIdScoped(prismaClient, {
        campaignId: 1,
        actionId: 1,
        viewer: {
          isMaster: true,
          ownCharacterIds: [],
          userId: "master-1",
        },
      });

      expect(result).not.toBeNull();
    });

    it("a plain PG that is neither sender nor a master does not see it (visibility unchanged)", async () => {
      // Nessuna condizione di visibilità combacia (non è il mittente e non
      // c'è alcun `receiverCharacterId` da matchare, essendo un ramo
      // libero): `findFirst` (scopato al `where` di visibilità) non
      // troverebbe la riga per un PG qualunque — simulato qui restituendo
      // `null`, esattamente come farebbe Prisma con quel `where`.
      prismaMock.action.findFirst.mockResolvedValue(null);

      const result = await getMissiveByIdScoped(prismaClient, {
        campaignId: 1,
        actionId: 1,
        viewer: {
          isMaster: false,
          characterIds: [999],
          hasActiveCharacter: true,
        },
      });

      expect(result).toBeNull();
    });
  });

  describe("markMissiveAsRead", () => {
    it("sets readDate when the missive exists, belongs to the campaign and matches the expected receiver", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        actionData: {
          subject: "Un avviso",
          description: "<p>Ciao</p>",
          receiverCharacterId: 20,
          readDate: null,
        },
      } as never);

      const result = await markMissiveAsRead(prismaClient, {
        campaignId: 1,
        actionId: 1,
        expectedReceiverCharacterId: 20,
      });

      expect(result).toBe(true);
      expect(prismaMock.action.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          actionData: expect.objectContaining({
            receiverCharacterId: 20,
            readDate: expect.any(String),
          }),
        },
      });
    });

    it("is idempotent: does not overwrite an already-set readDate", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        actionData: {
          subject: "Un avviso",
          description: "<p>Ciao</p>",
          receiverCharacterId: 20,
          readDate: "2024-03-01T10:00:00.000Z",
        },
      } as never);

      const result = await markMissiveAsRead(prismaClient, {
        campaignId: 1,
        actionId: 1,
        expectedReceiverCharacterId: 20,
      });

      expect(result).toBe(true);
      expect(prismaMock.action.update).not.toHaveBeenCalled();
    });

    it("returns false without writing when the missive does not belong to this campaign", async () => {
      prismaMock.action.findFirst.mockResolvedValue(null);

      const result = await markMissiveAsRead(prismaClient, {
        campaignId: 1,
        actionId: 999,
        expectedReceiverCharacterId: 20,
      });

      expect(result).toBe(false);
      expect(prismaMock.action.update).not.toHaveBeenCalled();
    });

    it("returns false without writing when the missive is not addressed to the expected character", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        actionData: {
          subject: "Un avviso",
          description: "<p>Ciao</p>",
          receiverCharacterId: 20,
          readDate: null,
        },
      } as never);

      const result = await markMissiveAsRead(prismaClient, {
        campaignId: 1,
        actionId: 1,
        expectedReceiverCharacterId: 999,
      });

      expect(result).toBe(false);
      expect(prismaMock.action.update).not.toHaveBeenCalled();
    });
  });

  describe("updateMissiveContentIfUnread", () => {
    it("updates the description when the missive is still unread (readDate explicitly null, not absent)", async () => {
      const actionData = {
        subject: "Un avviso",
        description: "<p>Vecchio contenuto</p>",
        receiverCharacterId: 99,
        readDate: null,
      };
      prismaMock.action.findFirst.mockResolvedValue({ actionData } as never);
      prismaMock.action.updateMany.mockResolvedValue({ count: 1 } as never);

      const result = await updateMissiveContentIfUnread(prismaClient, {
        campaignId: 1,
        actionId: 1,
        authorCharacterId: 10,
        description: "<p>Nuovo contenuto</p>",
      });

      expect(result).toBe("updated");
      // Compare-and-swap sull'INTERO `actionData` letto sopra (non un
      // filtro `path`/`Prisma.DbNull` su `readDate`, che non distinguerebbe
      // in modo affidabile "null esplicito" da "valore reale" — bug reale
      // corretto, vedi il commento sulla funzione): la `where` deve
      // contenere esattamente lo snapshot appena letto.
      expect(prismaMock.action.updateMany).toHaveBeenCalledWith({
        where: {
          id: 1,
          characterId: 10,
          actionData: { equals: actionData },
        },
        data: {
          actionData: expect.objectContaining({
            subject: "Un avviso",
            receiverCharacterId: 99,
            description: "<p>Nuovo contenuto</p>",
          }),
        },
      });
    });

    it("returns 'already-read' without even attempting the update, when readDate is already set (fast path)", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        actionData: {
          subject: "Un avviso",
          description: "<p>Vecchio contenuto</p>",
          receiverCharacterId: 99,
          readDate: "2024-06-02T10:00:00.000Z",
        },
      } as never);

      const result = await updateMissiveContentIfUnread(prismaClient, {
        campaignId: 1,
        actionId: 1,
        authorCharacterId: 10,
        description: "<p>Nuovo contenuto</p>",
      });

      expect(result).toBe("already-read");
      expect(prismaMock.action.updateMany).not.toHaveBeenCalled();
    });

    it("returns 'already-read' when the conditional update matches nothing (race: read happened between fetch and write)", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        actionData: {
          subject: "Un avviso",
          description: "<p>Vecchio contenuto</p>",
          receiverCharacterId: 99,
          readDate: null,
        },
      } as never);
      // La riga esiste ancora ma nel frattempo il destinatario l'ha letta:
      // il valore reale in DB non combacia più con lo snapshot letto sopra,
      // l'`updateMany` condizionale non combacia più con nessuna riga.
      prismaMock.action.updateMany.mockResolvedValue({ count: 0 } as never);

      const result = await updateMissiveContentIfUnread(prismaClient, {
        campaignId: 1,
        actionId: 1,
        authorCharacterId: 10,
        description: "<p>Nuovo contenuto</p>",
      });

      expect(result).toBe("already-read");
    });

    it("returns 'not-found' without writing when the missive does not belong to this author/campaign", async () => {
      prismaMock.action.findFirst.mockResolvedValue(null);

      const result = await updateMissiveContentIfUnread(prismaClient, {
        campaignId: 1,
        actionId: 999,
        authorCharacterId: 10,
        description: "<p>Nuovo contenuto</p>",
      });

      expect(result).toBe("not-found");
      expect(prismaMock.action.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("markCommunicationMissiveAsRead", () => {
    it("appends the characterId to readByCharacterIds when not already present", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        actionData: {
          subject: "Avviso a tutti",
          description: "<p>Ciao a tutti</p>",
          communication: true,
          readByCharacterIds: [20],
        },
      } as never);

      const result = await markCommunicationMissiveAsRead(prismaClient, {
        campaignId: 1,
        actionId: 1,
        characterIds: [30],
      });

      expect(result).toBe(true);
      expect(prismaMock.action.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          actionData: expect.objectContaining({
            readByCharacterIds: [20, 30],
          }),
        },
      });
    });

    // Bug A (T-0xx, chiarimento post-fix): una persona con PIÙ di un PG
    // attivo va marcata "ha letto" con OGNI suo PG attivo, non solo il
    // primo — un solo `update` per l'intero batch.
    it("appends ALL the given characterIds in a single update when a caller has more than one active PG", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        actionData: {
          subject: "Avviso a tutti",
          description: "<p>Ciao a tutti</p>",
          communication: true,
          readByCharacterIds: [],
        },
      } as never);

      const result = await markCommunicationMissiveAsRead(prismaClient, {
        campaignId: 1,
        actionId: 1,
        characterIds: [30, 31],
      });

      expect(result).toBe(true);
      expect(prismaMock.action.update).toHaveBeenCalledTimes(1);
      expect(prismaMock.action.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          actionData: expect.objectContaining({
            readByCharacterIds: [30, 31],
          }),
        },
      });
    });

    // Dedup: un batch che mischia id già presenti e nuovi aggiunge solo
    // quelli nuovi, senza duplicati.
    it("dedups: only the new ids among a mixed batch are appended", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        actionData: {
          subject: "Avviso a tutti",
          description: "<p>Ciao a tutti</p>",
          communication: true,
          readByCharacterIds: [20],
        },
      } as never);

      const result = await markCommunicationMissiveAsRead(prismaClient, {
        campaignId: 1,
        actionId: 1,
        characterIds: [20, 30],
      });

      expect(result).toBe(true);
      expect(prismaMock.action.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          actionData: expect.objectContaining({
            readByCharacterIds: [20, 30],
          }),
        },
      });
    });

    it("is idempotent: does not call update when every characterId already read it", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        actionData: {
          subject: "Avviso a tutti",
          description: "<p>Ciao a tutti</p>",
          communication: true,
          readByCharacterIds: [20, 30],
        },
      } as never);

      const result = await markCommunicationMissiveAsRead(prismaClient, {
        campaignId: 1,
        actionId: 1,
        characterIds: [30],
      });

      expect(result).toBe(true);
      expect(prismaMock.action.update).not.toHaveBeenCalled();
    });

    it("returns false without writing when the action is not a communication", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        actionData: {
          subject: "Un avviso",
          description: "<p>Ciao</p>",
          receiverCharacterId: 20,
          readDate: null,
        },
      } as never);

      const result = await markCommunicationMissiveAsRead(prismaClient, {
        campaignId: 1,
        actionId: 1,
        characterIds: [30],
      });

      expect(result).toBe(false);
      expect(prismaMock.action.update).not.toHaveBeenCalled();
    });

    it("returns false without writing when the action does not belong to this campaign", async () => {
      prismaMock.action.findFirst.mockResolvedValue(null);

      const result = await markCommunicationMissiveAsRead(prismaClient, {
        campaignId: 1,
        actionId: 999,
        characterIds: [30],
      });

      expect(result).toBe(false);
      expect(prismaMock.action.update).not.toHaveBeenCalled();
    });
  });

  describe("markFreeReceiverMissiveAsRead", () => {
    it("sets readDate when the missive exists, belongs to the campaign and is a free-receiver missive", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        actionData: {
          subject: "Un avviso al taverniere",
          description: "<p>Ciao</p>",
          receiverFreeText: "Il taverniere",
          readDate: null,
        },
      } as never);

      const result = await markFreeReceiverMissiveAsRead(prismaClient, {
        campaignId: 1,
        actionId: 1,
      });

      expect(result).toBe(true);
      expect(prismaMock.action.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          actionData: expect.objectContaining({
            receiverFreeText: "Il taverniere",
            readDate: expect.any(String),
          }),
        },
      });
    });

    it("is idempotent: does not overwrite an already-set readDate", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        actionData: {
          subject: "Un avviso al taverniere",
          description: "<p>Ciao</p>",
          receiverFreeText: "Il taverniere",
          readDate: "2024-03-01T10:00:00.000Z",
        },
      } as never);

      const result = await markFreeReceiverMissiveAsRead(prismaClient, {
        campaignId: 1,
        actionId: 1,
      });

      expect(result).toBe(true);
      expect(prismaMock.action.update).not.toHaveBeenCalled();
    });

    it("returns false without writing when the missive does not belong to this campaign", async () => {
      prismaMock.action.findFirst.mockResolvedValue(null);

      const result = await markFreeReceiverMissiveAsRead(prismaClient, {
        campaignId: 1,
        actionId: 999,
      });

      expect(result).toBe(false);
      expect(prismaMock.action.update).not.toHaveBeenCalled();
    });

    it("returns false without writing when the action is not a free-receiver missive", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        actionData: {
          subject: "Un avviso",
          description: "<p>Ciao</p>",
          receiverCharacterId: 20,
          readDate: null,
        },
      } as never);

      const result = await markFreeReceiverMissiveAsRead(prismaClient, {
        campaignId: 1,
        actionId: 1,
      });

      expect(result).toBe(false);
      expect(prismaMock.action.update).not.toHaveBeenCalled();
    });
  });

  // T-0xx "risposte alle missive": recupero del thread completo (radice
  // esclusa) di una missiva reale.
  describe("getThreadReplies", () => {
    it("returns an empty array without querying campaign characters when the thread has no replies", async () => {
      prismaMock.action.findMany.mockResolvedValue([]);

      const result = await getThreadReplies(prismaClient, {
        campaignId: 1,
        actionId: 1,
        viewer: { isMaster: true, ownCharacterIds: [], userId: "master-1" },
      });

      expect(result).toEqual([]);
      expect(prismaMock.character.findMany).not.toHaveBeenCalled();
    });

    it("resolves sender/receiver for every reply, ordered ascending, scoped by threadRootId", async () => {
      const reply = {
        ...mockAction({
          id: 2,
          characterId: 20,
          featureId: 7,
          actionData: {
            subject: "Re: Un avviso",
            description: "<p>Risposta</p>",
            receiverCharacterId: 10,
            readDate: null,
            threadRootId: 1,
          },
        }),
        character: {
          id: 20,
          name: "Aurelio",
          avatar: null,
          user: { name: "Player Aurelio" },
        },
      };
      prismaMock.action.findMany.mockResolvedValue([reply] as never);
      prismaMock.character.findMany.mockResolvedValue([
        {
          id: 10,
          name: "Aldric",
          avatar: null,
          type: "pg",
          user: { name: "Mario Rossi" },
        },
        {
          id: 20,
          name: "Aurelio",
          avatar: null,
          type: "pg",
          user: { name: "Player Aurelio" },
        },
      ] as never);

      const result = await getThreadReplies(prismaClient, {
        campaignId: 1,
        actionId: 1,
        viewer: { isMaster: true, ownCharacterIds: [], userId: "master-1" },
      });

      expect(prismaMock.action.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            feature: {
              campaignId: 1,
              featureType: { functionName: "missive" },
            },
            actionData: { path: ["threadRootId"], equals: 1 },
          },
          orderBy: { creationDate: "asc" },
        })
      );
      expect(result).toHaveLength(1);
      expect(result[0].isReply).toBe(true);
      expect(result[0].threadRootId).toBe(1);
      expect(result[0].character?.name).toBe("Aurelio");
      expect(result[0].receiver).toEqual({
        id: 10,
        name: "Aldric",
        avatar: null,
        userName: "Mario Rossi",
        type: "pg",
      });
    });
  });

  // T-0xx "risposte alle missive": gate server-side "chi può rispondere ora,
  // e a chi" — mai dedotto lato client.
  describe("getReplyEligibility", () => {
    const config = {
      canAnswer: true,
      canAnswerThread: false,
      maxThreadMessages: 50,
    };

    it("is not allowed when the root missive does not exist", async () => {
      prismaMock.action.findFirst.mockResolvedValue(null);

      const result = await getReplyEligibility(prismaClient, {
        campaignId: 1,
        rootActionId: 999,
        config,
      });

      expect(result.allowed).toBe(false);
    });

    // Da T-0xx (missive "a nome del master" rispondibili): un root
    // `characterId: null` NON è più bloccato di per sé (vedi i test dedicati
    // sotto) — resta bloccata solo la Comunicazione, che condivide
    // `characterId: null` ma è discriminata da `isCommunicationMissive`.
    it("is never allowed for a Comunicazione root (characterId: null, communication: true)", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        characterId: null,
        actionData: {
          subject: "Avviso a tutti",
          description: "<p>Ciao</p>",
          communication: true,
          readByCharacterIds: [],
        },
      } as never);

      const result = await getReplyEligibility(prismaClient, {
        campaignId: 1,
        rootActionId: 1,
        config,
      });

      expect(result.allowed).toBe(false);
      expect(prismaMock.action.findMany).not.toHaveBeenCalled();
    });

    it("is never allowed for a free-receiver root", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        characterId: 10,
        actionData: {
          subject: "Un avviso al taverniere",
          description: "<p>Ciao</p>",
          receiverFreeText: "Il taverniere",
          readDate: null,
        },
      } as never);

      const result = await getReplyEligibility(prismaClient, {
        campaignId: 1,
        rootActionId: 1,
        config,
      });

      expect(result.allowed).toBe(false);
    });

    it("is not allowed when the campaign feature has canAnswer disabled", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        characterId: 10,
        actionData: {
          subject: "Un avviso",
          description: "<p>Ciao</p>",
          receiverCharacterId: 20,
          readDate: null,
        },
      } as never);

      const result = await getReplyEligibility(prismaClient, {
        campaignId: 1,
        rootActionId: 1,
        config: {
          canAnswer: false,
          canAnswerThread: false,
          maxThreadMessages: 50,
        },
      });

      expect(result.allowed).toBe(false);
    });

    it("allows the first reply, turn goes to the root's receiver", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        characterId: 10,
        actionData: {
          subject: "Un avviso",
          description: "<p>Ciao</p>",
          receiverCharacterId: 20,
          readDate: null,
        },
      } as never);
      prismaMock.action.findMany.mockResolvedValue([]);

      const result = await getReplyEligibility(prismaClient, {
        campaignId: 1,
        rootActionId: 1,
        config,
      });

      expect(result).toEqual({
        allowed: true,
        expectedSenderCharacterId: 20,
        expectedReceiverCharacterId: 10,
      });
    });

    // T-0xx, vincolo PER-MESSAGGIO "Permetti al destinatario di rispondere":
    // il mittente dell'ULTIMO messaggio del thread (qui la radice, nessuna
    // risposta ancora) lo ha disattivato — blocca a prescindere dal fatto
    // che la campagna permetta altrimenti lo scambio (`config.canAnswer`
    // attivo qui).
    it("blocks a reply when the last message has allowReply: false", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        characterId: 10,
        actionData: {
          subject: "Un avviso",
          description: "<p>Ciao</p>",
          receiverCharacterId: 20,
          readDate: null,
          allowReply: false,
        },
      } as never);
      prismaMock.action.findMany.mockResolvedValue([]);

      const result = await getReplyEligibility(prismaClient, {
        campaignId: 1,
        rootActionId: 1,
        config,
      });

      expect(result.allowed).toBe(false);
    });

    // Assenza della chiave (dati legacy) = permesso, coerente col default
    // Zod `allowReply: true` — comportamento invariato rispetto a prima
    // dell'introduzione del checkbox (già coperto anche dagli altri test di
    // questo blocco, che non valorizzano mai `allowReply`).
    it("allows a reply when the last message has allowReply: true explicitly", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        characterId: 10,
        actionData: {
          subject: "Un avviso",
          description: "<p>Ciao</p>",
          receiverCharacterId: 20,
          readDate: null,
          allowReply: true,
        },
      } as never);
      prismaMock.action.findMany.mockResolvedValue([]);

      const result = await getReplyEligibility(prismaClient, {
        campaignId: 1,
        rootActionId: 1,
        config,
      });

      expect(result.allowed).toBe(true);
    });

    it("blocks a second reply when canAnswerThread is disabled", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        characterId: 10,
        actionData: {
          subject: "Un avviso",
          description: "<p>Ciao</p>",
          receiverCharacterId: 20,
          readDate: null,
        },
      } as never);
      prismaMock.action.findMany.mockResolvedValue([
        {
          characterId: 20,
          actionData: {
            subject: "Re: Un avviso",
            description: "<p>Risposta</p>",
            receiverCharacterId: 10,
            readDate: null,
            threadRootId: 1,
          },
          creationDate: new Date("2024-03-01T10:00:00.000Z"),
        },
      ] as never);

      const result = await getReplyEligibility(prismaClient, {
        campaignId: 1,
        rootActionId: 1,
        config,
      });

      expect(result.allowed).toBe(false);
    });

    it("allows a second reply when canAnswerThread is enabled, turn swaps back to the root's sender", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        characterId: 10,
        actionData: {
          subject: "Un avviso",
          description: "<p>Ciao</p>",
          receiverCharacterId: 20,
          readDate: null,
        },
      } as never);
      prismaMock.action.findMany.mockResolvedValue([
        {
          characterId: 20,
          actionData: {
            subject: "Re: Un avviso",
            description: "<p>Risposta</p>",
            receiverCharacterId: 10,
            readDate: null,
            threadRootId: 1,
          },
          creationDate: new Date("2024-03-01T10:00:00.000Z"),
        },
      ] as never);

      const result = await getReplyEligibility(prismaClient, {
        campaignId: 1,
        rootActionId: 1,
        config: {
          canAnswer: true,
          canAnswerThread: true,
          maxThreadMessages: 50,
        },
      });

      expect(result).toEqual({
        allowed: true,
        expectedSenderCharacterId: 10,
        expectedReceiverCharacterId: 20,
      });
    });

    // T-0xx, tetto numerico al thread: radice + 3 risposte già presenti = 4
    // messaggi totali, pari a `maxThreadMessages: 4` configurato — il thread
    // ha raggiunto il limite, la prossima risposta è bloccata.
    it("blocks a reply when the thread has reached maxThreadMessages", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        characterId: 10,
        actionData: {
          subject: "Un avviso",
          description: "<p>Ciao</p>",
          receiverCharacterId: 20,
          readDate: null,
        },
      } as never);
      prismaMock.action.findMany.mockResolvedValue([
        {
          characterId: 20,
          actionData: {
            subject: "Re: Un avviso",
            description: "<p>Risposta 1</p>",
            receiverCharacterId: 10,
            readDate: null,
            threadRootId: 1,
          },
          creationDate: new Date("2024-03-01T10:00:00.000Z"),
        },
        {
          characterId: 10,
          actionData: {
            subject: "Re: Un avviso",
            description: "<p>Risposta 2</p>",
            receiverCharacterId: 20,
            readDate: null,
            threadRootId: 1,
          },
          creationDate: new Date("2024-03-01T11:00:00.000Z"),
        },
        {
          characterId: 20,
          actionData: {
            subject: "Re: Un avviso",
            description: "<p>Risposta 3</p>",
            receiverCharacterId: 10,
            readDate: null,
            threadRootId: 1,
          },
          creationDate: new Date("2024-03-01T12:00:00.000Z"),
        },
      ] as never);

      const result = await getReplyEligibility(prismaClient, {
        campaignId: 1,
        rootActionId: 1,
        config: {
          canAnswer: true,
          canAnswerThread: true,
          maxThreadMessages: 4,
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/numero massimo di messaggi/);
    });

    // Stesso scenario ma sotto il limite (radice + 2 risposte = 3, contro
    // `maxThreadMessages: 4`): il gate del tetto non blocca, il turno resta
    // determinato normalmente.
    it("allows a reply when the thread is still under maxThreadMessages", async () => {
      prismaMock.action.findFirst.mockResolvedValue({
        characterId: 10,
        actionData: {
          subject: "Un avviso",
          description: "<p>Ciao</p>",
          receiverCharacterId: 20,
          readDate: null,
        },
      } as never);
      prismaMock.action.findMany.mockResolvedValue([
        {
          characterId: 20,
          actionData: {
            subject: "Re: Un avviso",
            description: "<p>Risposta 1</p>",
            receiverCharacterId: 10,
            readDate: null,
            threadRootId: 1,
          },
          creationDate: new Date("2024-03-01T10:00:00.000Z"),
        },
        {
          characterId: 10,
          actionData: {
            subject: "Re: Un avviso",
            description: "<p>Risposta 2</p>",
            receiverCharacterId: 20,
            readDate: null,
            threadRootId: 1,
          },
          creationDate: new Date("2024-03-01T11:00:00.000Z"),
        },
      ] as never);

      const result = await getReplyEligibility(prismaClient, {
        campaignId: 1,
        rootActionId: 1,
        config: {
          canAnswer: true,
          canAnswerThread: true,
          maxThreadMessages: 4,
        },
      });

      expect(result.allowed).toBe(true);
    });

    // T-0xx, missive "a nome del master" rispondibili: root `characterId:
    // null` scritta da un master (`authorUserId`), destinatario un PG
    // reale — il PG destinatario può ora rispondere, fasando il master
    // sull'`authorUserId` della radice (mai un `receiverCharacterId`, non
    // c'è un `Character` master).
    describe("thread 'a nome del master'", () => {
      it("allows the PG to reply to the master's root, turn goes to the receiver, expectedReceiverUserId is the root's author", async () => {
        prismaMock.action.findFirst.mockResolvedValue({
          characterId: null,
          authorUserId: "master-1",
          actionData: {
            subject: "Un avviso a nome del master",
            description: "<p>Ciao</p>",
            receiverCharacterId: 20,
            readDate: null,
          },
        } as never);
        prismaMock.action.findMany.mockResolvedValue([]);

        const result = await getReplyEligibility(prismaClient, {
          campaignId: 1,
          rootActionId: 1,
          config,
        });

        expect(result).toEqual({
          allowed: true,
          expectedSenderCharacterId: 20,
          expectedReceiverUserId: "master-1",
        });
      });

      it("after the PG's reply, it's the master's turn: expectedSenderUserId is the root's author, expectedReceiverCharacterId is the PG", async () => {
        prismaMock.action.findFirst.mockResolvedValue({
          characterId: null,
          authorUserId: "master-1",
          actionData: {
            subject: "Un avviso a nome del master",
            description: "<p>Ciao</p>",
            receiverCharacterId: 20,
            readDate: null,
          },
        } as never);
        prismaMock.action.findMany.mockResolvedValue([
          {
            characterId: 20,
            authorUserId: null,
            actionData: {
              subject: "Re: Un avviso a nome del master",
              description: "<p>Risposta</p>",
              receiverUserId: "master-1",
              readDate: null,
              threadRootId: 1,
            },
            creationDate: new Date("2024-03-01T10:00:00.000Z"),
          },
        ] as never);

        const result = await getReplyEligibility(prismaClient, {
          campaignId: 1,
          rootActionId: 1,
          config: {
            canAnswer: true,
            canAnswerThread: true,
            maxThreadMessages: 50,
          },
        });

        expect(result).toEqual({
          allowed: true,
          expectedSenderUserId: "master-1",
          expectedReceiverCharacterId: 20,
        });
      });

      it("a different master (different authorUserId) does not automatically get the turn from getReplyEligibility alone — the caller must compare expectedSenderUserId", async () => {
        prismaMock.action.findFirst.mockResolvedValue({
          characterId: null,
          authorUserId: "master-1",
          actionData: {
            subject: "Un avviso a nome del master",
            description: "<p>Ciao</p>",
            receiverCharacterId: 20,
            readDate: null,
          },
        } as never);
        prismaMock.action.findMany.mockResolvedValue([
          {
            characterId: 20,
            authorUserId: null,
            actionData: {
              subject: "Re: Un avviso a nome del master",
              description: "<p>Risposta</p>",
              receiverUserId: "master-1",
              readDate: null,
              threadRootId: 1,
            },
            creationDate: new Date("2024-03-01T10:00:00.000Z"),
          },
        ] as never);

        const result = await getReplyEligibility(prismaClient, {
          campaignId: 1,
          rootActionId: 1,
          config: {
            canAnswer: true,
            canAnswerThread: true,
            maxThreadMessages: 50,
          },
        });

        // `getReplyEligibility` non conosce l'identità di chi sta
        // scrivendo: il confronto `expectedSenderUserId !== masterUserId`
        // spetta al chiamante (`createMasterMissiveAction`) — qui si
        // verifica solo che l'autore atteso resti quello della RADICE
        // (`master-1`), mai un master diverso.
        expect(result.expectedSenderUserId).toBe("master-1");
        expect(result.expectedSenderUserId).not.toBe("master-2");
      });

      // T-0xx, vincolo PER-MESSAGGIO applicato ANCHE al thread "a nome del
      // master": qui è la radice (scritta dal master) l'ultimo messaggio
      // (nessuna risposta ancora) ad avere `allowReply: false` — il PG non
      // può rispondere, stesso identico gate del ramo reale sopra.
      it("blocks the PG from replying when the master's root has allowReply: false", async () => {
        prismaMock.action.findFirst.mockResolvedValue({
          characterId: null,
          authorUserId: "master-1",
          actionData: {
            subject: "Un avviso a nome del master",
            description: "<p>Ciao</p>",
            receiverCharacterId: 20,
            readDate: null,
            allowReply: false,
          },
        } as never);
        prismaMock.action.findMany.mockResolvedValue([]);

        const result = await getReplyEligibility(prismaClient, {
          campaignId: 1,
          rootActionId: 1,
          config,
        });

        expect(result.allowed).toBe(false);
      });

      // Stesso vincolo, ma sulla RISPOSTA del PG (non sulla radice): il
      // master non può raccogliere il turno se il PG ha chiuso il thread al
      // proprio messaggio.
      it("blocks the master from replying when the PG's reply has allowReply: false", async () => {
        prismaMock.action.findFirst.mockResolvedValue({
          characterId: null,
          authorUserId: "master-1",
          actionData: {
            subject: "Un avviso a nome del master",
            description: "<p>Ciao</p>",
            receiverCharacterId: 20,
            readDate: null,
          },
        } as never);
        prismaMock.action.findMany.mockResolvedValue([
          {
            characterId: 20,
            authorUserId: null,
            actionData: {
              subject: "Re: Un avviso a nome del master",
              description: "<p>Risposta</p>",
              receiverUserId: "master-1",
              readDate: null,
              threadRootId: 1,
              allowReply: false,
            },
            creationDate: new Date("2024-03-01T10:00:00.000Z"),
          },
        ] as never);

        const result = await getReplyEligibility(prismaClient, {
          campaignId: 1,
          rootActionId: 1,
          config: {
            canAnswer: true,
            canAnswerThread: true,
            maxThreadMessages: 50,
          },
        });

        expect(result.allowed).toBe(false);
      });

      it("is not allowed for a legacy master-authored root without authorUserId", async () => {
        prismaMock.action.findFirst.mockResolvedValue({
          characterId: null,
          authorUserId: null,
          actionData: {
            subject: "Un avviso a nome del master",
            description: "<p>Ciao</p>",
            receiverCharacterId: 20,
            readDate: null,
          },
        } as never);

        const result = await getReplyEligibility(prismaClient, {
          campaignId: 1,
          rootActionId: 1,
          config,
        });

        expect(result.allowed).toBe(false);
        expect(prismaMock.action.findMany).not.toHaveBeenCalled();
      });
    });
  });
});
