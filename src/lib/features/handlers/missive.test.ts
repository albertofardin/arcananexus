import { describe, it, expect, beforeEach, vi } from "vitest";
import { CharacterType, type PrismaClient } from "@prisma/client";
import { getFeatureHandler, ActionDataValidationError } from "../registry";
import { InsufficientDowntimePointsError } from "../downtimePoints";
import { InsufficientMissivePointsError } from "../missivePoints";
import { FT_MISSIVE } from "../featuresName";
// Side-effect import (esegue `registerFeatureHandler` in coda al modulo) +
// export usati dalla suite `createMasterMissiveAction` sotto.
import {
  createMasterMissiveAction,
  isFreeReceiverMissive,
  MissiveReceiverNotFoundError,
  MissiveReplyNotAllowedError,
  parseMissiveActionData,
} from "./missive";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import {
  mockAction,
  mockCampaign,
  mockCharacter,
  mockFeature,
} from "@/test/helpers/prisma-fixtures";

// `$transaction` di default esegue davvero la callback passandole lo stesso
// client mockato — stesso pattern di `downtimeAction.test.ts`/`talents.test.ts`.
function stubPassthroughTransaction() {
  prismaMock.$transaction.mockImplementation((async (
    fn: (tx: PrismaClient) => Promise<unknown>
  ) => fn(prismaClient)) as never);
}

// Mock del destinatario risolto via `getCharacterInCampaign` (`character.
// repository.ts`): l'handler non legge più il tipo da `actionData` (vedi
// commento su `missiveActionSchema`), lo risolve sempre dal `Character`
// reale — ogni test che invoca l'handler deve quindi mockare questa query.
function mockReceiver(type: CharacterType) {
  prismaMock.character.findUnique.mockResolvedValue(
    mockCharacter({ id: 5, campaignId: 1, type })
  );
}

describe("missive handler (T-0xx)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubPassthroughTransaction();
  });

  it("registra un solo functionName per la feature unificata", () => {
    const definition = getFeatureHandler(FT_MISSIVE);
    expect(definition.functionName).toBe(FT_MISSIVE);
  });

  it("richiede receiverCharacterId (id numerico del Character) nell'actionData, non un tipo dichiarato dal client", () => {
    const definition = getFeatureHandler(FT_MISSIVE);
    expect(
      definition.actionSchema.safeParse({
        description: "Ti scrivo per avvisarti",
        subject: "Oggetto",
        receiverCharacterId: 5,
      }).success
    ).toBe(true);
    expect(
      definition.actionSchema.safeParse({
        description: "Ti scrivo per avvisarti",
        subject: "Oggetto",
      }).success
    ).toBe(false);
    // Un ipotetico `receiverType` non è (più) un campo dello schema (era un
    // valore dichiarato dal client, mai verificato contro il
    // `Character.type` reale — vedi il commento su `missiveActionSchema`):
    // un payload che include una chiave del genere viene rifiutato come
    // chiave sconosciuta.
    expect(
      definition.actionSchema.safeParse({
        description: "Ti scrivo per avvisarti",
        subject: "Oggetto",
        receiverCharacterId: 5,
        receiverType: "pg",
      }).success
    ).toBe(false);
  });

  it("rifiuta con MissiveReceiverNotFoundError se il destinatario non esiste nella campagna", async () => {
    const definition = getFeatureHandler(FT_MISSIVE);
    const character = mockCharacter({
      id: 1,
      campaignId: 1,
      missivePoints: 3,
    });
    const feature = mockFeature({ id: 7, campaignId: 1, featureData: {} });
    prismaMock.character.findUnique.mockResolvedValue(null);

    await expect(
      definition.handler(prismaClient, {
        character,
        feature,
        actionData: {
          description: "Ti scrivo per avvisarti",
          subject: "Oggetto",
          receiverCharacterId: 999,
        },
        campaign: mockCampaign({ id: 1 }),
      })
    ).rejects.toBeInstanceOf(MissiveReceiverNotFoundError);
    expect(prismaMock.action.create).not.toHaveBeenCalled();
  });

  it("scala 1 missiva disponibile per una missiva a PG", async () => {
    const definition = getFeatureHandler(FT_MISSIVE);
    const character = mockCharacter({
      id: 1,
      campaignId: 1,
      missivePoints: 3,
      downtimePoints: 5,
    });
    const feature = mockFeature({ id: 7, campaignId: 1, featureData: {} });
    const action = mockAction({
      id: 42,
      characterId: 1,
      featureId: 7,
      actionData: {
        description: "Ti scrivo per avvisarti",
        subject: "Oggetto",
        receiverCharacterId: 5,
      },
    });
    prismaMock.action.create.mockResolvedValue(action);
    mockReceiver(CharacterType.pg);

    const result = await definition.handler(prismaClient, {
      character,
      feature,
      actionData: {
        description: "Ti scrivo per avvisarti",
        subject: "Oggetto",
        receiverCharacterId: 5,
      },
      campaign: mockCampaign({ id: 1 }),
    });

    expect(result).toEqual({ action });
    expect(prismaMock.character.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.character.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { missivePoints: { increment: -1 } },
    });
    // Notifica (T-0xx, pannello notifiche): il proprietario del PG
    // destinatario reale (`mockReceiver`, `userId: "user-1"`).
    expect(prismaMock.notification.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        campaignId: 1,
        type: "missive",
        entityId: 42,
      },
    });
  });

  it("scala 1 missiva anche per una missiva a PNG quando pngCountsAsDowntime non è attivo", async () => {
    const definition = getFeatureHandler(FT_MISSIVE);
    const character = mockCharacter({
      id: 1,
      campaignId: 1,
      missivePoints: 2,
      downtimePoints: 5,
    });
    const feature = mockFeature({
      id: 8,
      campaignId: 1,
      featureData: { pngCountsAsDowntime: false },
    });
    prismaMock.action.create.mockResolvedValue(
      mockAction({ id: 43, characterId: 1, featureId: 8 })
    );
    mockReceiver(CharacterType.png);

    await definition.handler(prismaClient, {
      character,
      feature,
      actionData: {
        description: "Attenzione, straniero",
        subject: "Oggetto",
        receiverCharacterId: 5,
      },
      campaign: mockCampaign({ id: 1 }),
    });

    expect(prismaMock.character.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.character.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { missivePoints: { increment: -1 } },
    });
  });

  it("con pngCountsAsDowntime attivo, una missiva a PNG scala 1 punto downtime invece che una missiva", async () => {
    const definition = getFeatureHandler(FT_MISSIVE);
    const character = mockCharacter({
      id: 1,
      campaignId: 1,
      missivePoints: 0,
      downtimePoints: 5,
    });
    const feature = mockFeature({
      id: 8,
      campaignId: 1,
      featureData: { pngCountsAsDowntime: true },
    });
    prismaMock.action.create.mockResolvedValue(
      mockAction({ id: 43, characterId: 1, featureId: 8 })
    );
    mockReceiver(CharacterType.png);

    await definition.handler(prismaClient, {
      character,
      feature,
      actionData: {
        description: "Attenzione, straniero",
        subject: "Oggetto",
        receiverCharacterId: 5,
      },
      campaign: mockCampaign({ id: 1 }),
    });

    expect(prismaMock.character.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.character.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { downtimePoints: { increment: -1 } },
    });
  });

  it("con pngCountsAsDowntime attivo, una missiva a PG scala comunque il conteggio missive (non downtime)", async () => {
    const definition = getFeatureHandler(FT_MISSIVE);
    const character = mockCharacter({
      id: 1,
      campaignId: 1,
      missivePoints: 3,
      downtimePoints: 5,
    });
    const feature = mockFeature({
      id: 8,
      campaignId: 1,
      featureData: { pngCountsAsDowntime: true },
    });
    prismaMock.action.create.mockResolvedValue(
      mockAction({ id: 43, characterId: 1, featureId: 8 })
    );
    mockReceiver(CharacterType.pg);

    await definition.handler(prismaClient, {
      character,
      feature,
      actionData: {
        description: "Ti scrivo per avvisarti",
        subject: "Oggetto",
        receiverCharacterId: 5,
      },
      campaign: mockCampaign({ id: 1 }),
    });

    expect(prismaMock.character.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.character.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { missivePoints: { increment: -1 } },
    });
  });

  it("rifiuta con InsufficientMissivePointsError quando il contatore è esaurito, senza creare l'Action", async () => {
    const definition = getFeatureHandler(FT_MISSIVE);
    const character = mockCharacter({
      id: 1,
      campaignId: 1,
      missivePoints: 0,
    });
    const feature = mockFeature({ id: 7, campaignId: 1, featureData: {} });
    mockReceiver(CharacterType.pg);

    await expect(
      definition.handler(prismaClient, {
        character,
        feature,
        actionData: {
          description: "Ti scrivo per avvisarti",
          subject: "Oggetto",
          receiverCharacterId: 5,
        },
        campaign: mockCampaign({ id: 1 }),
      })
    ).rejects.toBeInstanceOf(InsufficientMissivePointsError);
    expect(prismaMock.action.create).not.toHaveBeenCalled();
  });

  it("rifiuta con InsufficientDowntimePointsError quando pngCountsAsDowntime è attivo ma il saldo downtime è a zero", async () => {
    const definition = getFeatureHandler(FT_MISSIVE);
    const character = mockCharacter({
      id: 1,
      campaignId: 1,
      missivePoints: 2,
      downtimePoints: 0,
    });
    const feature = mockFeature({
      id: 7,
      campaignId: 1,
      featureData: { pngCountsAsDowntime: true },
    });
    mockReceiver(CharacterType.png);

    await expect(
      definition.handler(prismaClient, {
        character,
        feature,
        actionData: {
          description: "Attenzione, straniero",
          subject: "Oggetto",
          receiverCharacterId: 5,
        },
        campaign: mockCampaign({ id: 1 }),
      })
    ).rejects.toBeInstanceOf(InsufficientDowntimePointsError);
    expect(prismaMock.action.create).not.toHaveBeenCalled();
  });

  // Decisione B (T-0xx): il bypass vale sempre per master/head_master/
  // super-admin, a prescindere dal personaggio scelto come mittente — anche
  // quando il mittente è un PG reale (0 punti disponibili, che senza
  // `bypassLimits` avrebbe rigettato la chiamata).
  // Campo libero (T-0xx, `receiverFreeText`): registrato sotto lo stesso
  // `functionName` del ramo reale (`missiveDirectActionSchema`, union), ma
  // senza alcun `Character` destinatario da risolvere — nessuna chiamata a
  // `character.findUnique` su questo ramo.
  it("accetta il ramo Campo libero (receiverFreeText) nell'actionSchema registrato", () => {
    const definition = getFeatureHandler(FT_MISSIVE);
    expect(
      definition.actionSchema.safeParse({
        description: "Ti scrivo per avvisarti",
        subject: "Oggetto",
        receiverFreeText: "Il taverniere",
      }).success
    ).toBe(true);
    // Vuoto/blank non è un destinatario valido.
    expect(
      definition.actionSchema.safeParse({
        description: "Ti scrivo per avvisarti",
        subject: "Oggetto",
        receiverFreeText: "   ",
      }).success
    ).toBe(false);
  });

  it("con Campo libero, scala 1 missiva senza risolvere alcun Character quando pngCountsAsDowntime non è attivo", async () => {
    const definition = getFeatureHandler(FT_MISSIVE);
    const character = mockCharacter({
      id: 1,
      campaignId: 1,
      missivePoints: 2,
      downtimePoints: 5,
    });
    const feature = mockFeature({
      id: 8,
      campaignId: 1,
      featureData: { pngCountsAsDowntime: false },
    });
    prismaMock.action.create.mockResolvedValue(
      mockAction({ id: 60, characterId: 1, featureId: 8 })
    );

    await definition.handler(prismaClient, {
      character,
      feature,
      actionData: {
        description: "Attenzione, straniero",
        subject: "Oggetto",
        receiverFreeText: "Il taverniere",
      },
      campaign: mockCampaign({ id: 1 }),
    });

    expect(prismaMock.character.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.character.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { missivePoints: { increment: -1 } },
    });
    // Nessuna notifica sul ramo Campo libero (T-0xx): nessun destinatario
    // reale a cui indirizzarla.
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
  });

  it("con Campo libero e pngCountsAsDowntime attivo, scala 1 punto downtime invece che una missiva", async () => {
    const definition = getFeatureHandler(FT_MISSIVE);
    const character = mockCharacter({
      id: 1,
      campaignId: 1,
      missivePoints: 0,
      downtimePoints: 5,
    });
    const feature = mockFeature({
      id: 8,
      campaignId: 1,
      featureData: { pngCountsAsDowntime: true },
    });
    prismaMock.action.create.mockResolvedValue(
      mockAction({ id: 61, characterId: 1, featureId: 8 })
    );

    await definition.handler(prismaClient, {
      character,
      feature,
      actionData: {
        description: "Attenzione, straniero",
        subject: "Oggetto",
        receiverFreeText: "Il taverniere",
      },
      campaign: mockCampaign({ id: 1 }),
    });

    expect(prismaMock.character.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.character.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { downtimePoints: { increment: -1 } },
    });
  });

  it("con bypassLimits: true non scala alcun punto anche a saldo zero", async () => {
    const definition = getFeatureHandler(FT_MISSIVE);
    const character = mockCharacter({
      id: 1,
      campaignId: 1,
      missivePoints: 0,
      downtimePoints: 0,
    });
    const feature = mockFeature({ id: 7, campaignId: 1, featureData: {} });
    prismaMock.action.create.mockResolvedValue(
      mockAction({ id: 44, characterId: 1, featureId: 7 })
    );
    mockReceiver(CharacterType.pg);

    const result = await definition.handler(prismaClient, {
      character,
      feature,
      actionData: {
        description: "Ti scrivo per avvisarti",
        subject: "Oggetto",
        receiverCharacterId: 5,
      },
      campaign: mockCampaign({ id: 1 }),
      bypassLimits: true,
    });

    expect(result.action.id).toBe(44);
    expect(prismaMock.character.update).not.toHaveBeenCalled();
    expect(prismaMock.action.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ characterId: 1 }),
      })
    );
  });

  // T-0xx "risposte alle missive": l'eligibility check (`getReplyEligibility`,
  // `missive.repository.ts`) gira DENTRO la stessa transazione dell'handler,
  // quindi questi test guidano lo scenario mockando direttamente
  // `prismaMock.action.findFirst`/`findMany` (la root e le eventuali
  // risposte già esistenti) — stesso stile "attraversa il repository reale"
  // già usato sopra per `getCharacterInCampaign` (`mockReceiver`), non un
  // mock della funzione di repository.
  describe("risposte (thread)", () => {
    // Root: mittente PG id 10, destinatario (chi risponde ora) PG id 20 —
    // nessuna risposta precedente, quindi il turno spetta al destinatario
    // originale.
    function mockRootWithNoReplies() {
      prismaMock.action.findFirst.mockResolvedValue({
        characterId: 10,
        actionData: {
          subject: "Un avviso",
          description: "Ciao",
          receiverCharacterId: 20,
          readDate: null,
        },
      } as never);
      prismaMock.action.findMany.mockResolvedValue([]);
    }

    it("crea la risposta scalando 1 missiva, sovrascrivendo il receiverCharacterId dichiarato dal client con quello risolto server-side", async () => {
      const definition = getFeatureHandler(FT_MISSIVE);
      mockRootWithNoReplies();
      const character = mockCharacter({
        id: 20,
        campaignId: 1,
        missivePoints: 3,
        downtimePoints: 5,
      });
      const feature = mockFeature({
        id: 7,
        campaignId: 1,
        featureData: { canAnswer: true },
      });
      mockReceiver(CharacterType.pg); // il destinatario risolto (id 10)
      prismaMock.action.create.mockResolvedValue(
        mockAction({ id: 100, characterId: 20, featureId: 7 })
      );

      const result = await definition.handler(prismaClient, {
        character,
        feature,
        actionData: {
          subject: "Ignorato: sovrascritto con Re: <oggetto root>",
          description: "Risposta",
          receiverCharacterId: 999, // dichiarato dal client, mai fidato
          threadRootId: 1,
        },
        campaign: mockCampaign({ id: 1 }),
      });

      expect(result.action.id).toBe(100);
      expect(prismaMock.character.update).toHaveBeenCalledWith({
        where: { id: 20 },
        data: { missivePoints: { increment: -1 } },
      });
      expect(prismaMock.action.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            characterId: 20,
            actionData: expect.objectContaining({ receiverCharacterId: 10 }),
          }),
        })
      );
    });

    it("con canAnswerFree attivo, non scala alcun punto anche a saldo zero", async () => {
      const definition = getFeatureHandler(FT_MISSIVE);
      mockRootWithNoReplies();
      const character = mockCharacter({
        id: 20,
        campaignId: 1,
        missivePoints: 0,
        downtimePoints: 0,
      });
      const feature = mockFeature({
        id: 7,
        campaignId: 1,
        featureData: { canAnswer: true, canAnswerFree: true },
      });
      mockReceiver(CharacterType.pg);
      prismaMock.action.create.mockResolvedValue(
        mockAction({ id: 101, characterId: 20, featureId: 7 })
      );

      await definition.handler(prismaClient, {
        character,
        feature,
        actionData: {
          subject: "Ignorato",
          description: "Risposta gratuita",
          receiverCharacterId: 10,
          threadRootId: 1,
        },
        campaign: mockCampaign({ id: 1 }),
      });

      expect(prismaMock.character.update).not.toHaveBeenCalled();
      expect(prismaMock.action.create).toHaveBeenCalled();
    });

    it("rifiuta con MissiveReplyNotAllowedError quando la feature ha canAnswer spenta", async () => {
      const definition = getFeatureHandler(FT_MISSIVE);
      mockRootWithNoReplies();
      const character = mockCharacter({
        id: 20,
        campaignId: 1,
        missivePoints: 3,
      });
      const feature = mockFeature({
        id: 7,
        campaignId: 1,
        featureData: { canAnswer: false },
      });

      await expect(
        definition.handler(prismaClient, {
          character,
          feature,
          actionData: {
            subject: "Ignorato",
            description: "Risposta",
            receiverCharacterId: 10,
            threadRootId: 1,
          },
          campaign: mockCampaign({ id: 1 }),
        })
      ).rejects.toBeInstanceOf(MissiveReplyNotAllowedError);
      expect(prismaMock.action.create).not.toHaveBeenCalled();
      expect(prismaMock.character.update).not.toHaveBeenCalled();
    });

    it("rifiuta con MissiveReplyNotAllowedError quando il mittente non ha diritto al turno", async () => {
      const definition = getFeatureHandler(FT_MISSIVE);
      mockRootWithNoReplies();
      // Il turno spetta al PG 20 (destinatario della root), non a questo
      // personaggio (id 999): un client che tenta di rispondere "a nome
      // di" un personaggio che non è il proprio deve essere respinto anche
      // se il resto del payload è corretto.
      const character = mockCharacter({
        id: 999,
        campaignId: 1,
        missivePoints: 3,
      });
      const feature = mockFeature({
        id: 7,
        campaignId: 1,
        featureData: { canAnswer: true },
      });

      await expect(
        definition.handler(prismaClient, {
          character,
          feature,
          actionData: {
            subject: "Ignorato",
            description: "Risposta fuori turno",
            receiverCharacterId: 10,
            threadRootId: 1,
          },
          campaign: mockCampaign({ id: 1 }),
        })
      ).rejects.toBeInstanceOf(MissiveReplyNotAllowedError);
      expect(prismaMock.action.create).not.toHaveBeenCalled();
    });

    // T-0xx, missive "a nome del master" rispondibili: la radice è
    // `characterId: null` (scritta dal master), quindi il turno di QUESTA
    // risposta spetta al PG destinatario — nessun `Character` a cui
    // rispondere (il mittente della root è il master), quindi nessuna
    // risoluzione PNG/downtime: sempre un punto missiva pieno.
    it("con radice 'a nome del master', crea la risposta come receiverUserId invece di receiverCharacterId, senza risolvere alcun Character", async () => {
      const definition = getFeatureHandler(FT_MISSIVE);
      prismaMock.action.findFirst.mockResolvedValue({
        characterId: null,
        authorUserId: "master-1",
        actionData: {
          subject: "Un avviso a nome del master",
          description: "Ciao",
          receiverCharacterId: 20,
          readDate: null,
        },
      } as never);
      prismaMock.action.findMany.mockResolvedValue([]);
      const character = mockCharacter({
        id: 20,
        campaignId: 1,
        missivePoints: 3,
        downtimePoints: 5,
      });
      const feature = mockFeature({
        id: 7,
        campaignId: 1,
        featureData: { canAnswer: true },
      });
      prismaMock.action.create.mockResolvedValue(
        mockAction({ id: 102, characterId: 20, featureId: 7 })
      );

      await definition.handler(prismaClient, {
        character,
        feature,
        actionData: {
          subject: "Ignorato",
          description: "Risposta al master",
          threadRootId: 1,
        },
        campaign: mockCampaign({ id: 1 }),
      });

      expect(prismaMock.character.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.character.update).toHaveBeenCalledWith({
        where: { id: 20 },
        data: { missivePoints: { increment: -1 } },
      });
      expect(prismaMock.action.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            characterId: 20,
            actionData: {
              subject: "Ignorato",
              description: "Risposta al master",
              threadRootId: 1,
              receiverUserId: "master-1",
            },
          }),
        })
      );
    });
  });
});

// `missiveActionSchema` è `.strict()` (eredita da `downtimeActionSchema`):
// nessuna normalizzazione di chiavi legacy esiste più (rimossa insieme al
// rename `readAt` → `readDate`, confermato morto dopo aver azzerato lo
// storico missive su DB) — un `actionData` con una chiave sconosciuta va
// sempre rifiutato, mai tollerato in silenzio. `allowReply` non è più un
// esempio valido di chiave "sconosciuta" da T-0xx (checkbox "Permetti al
// destinatario di rispondere", vedi `missiveActionSchema`): è tornata ad
// essere un campo reale, con semantica diversa dalla precedente incarnazione
// mai arrivata in produzione.
describe("parseMissiveActionData", () => {
  it("rifiuta una chiave sconosciuta nell'actionData, senza alcuna normalizzazione legacy", () => {
    expect(() =>
      parseMissiveActionData({
        subject: "Un avviso",
        description: "Ciao",
        receiverCharacterId: 5,
        readDate: null,
        notARealField: true,
      })
    ).toThrow();
  });
});

// Percorso dedicato all'invio "a nome del master" (decisione C, T-0xx): non
// passa dal registry generico (nessun `Character` da cui scalare punti o su
// cui appendere l'`Action`), quindi ha una sua suite separata.
describe("createMasterMissiveAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("crea un'Action con characterId: null, senza toccare i punti di alcun personaggio", async () => {
    const feature = mockFeature({ id: 9, campaignId: 1, featureData: {} });
    prismaMock.action.create.mockResolvedValue(
      mockAction({ id: 50, characterId: null, featureId: 9 })
    );
    prismaMock.character.findUnique.mockResolvedValue(
      mockCharacter({ id: 5, campaignId: 1, type: CharacterType.pg })
    );

    const result = await createMasterMissiveAction(prismaClient, {
      feature,
      actionData: {
        description: "Un avviso a nome del master",
        subject: "Oggetto",
        receiverCharacterId: 5,
      },
      masterUserId: "master-1",
    });

    expect(result.action.characterId).toBeNull();
    expect(prismaMock.action.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        characterId: null,
        featureId: 9,
        // Autore reale (T-0xx): QUALE master ha scritto la missiva.
        authorUserId: "master-1",
      }),
    });
    expect(prismaMock.character.update).not.toHaveBeenCalled();
    // Notifica (T-0xx): il proprietario del PG destinatario reale.
    expect(prismaMock.notification.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        campaignId: 1,
        type: "missive",
        entityId: 50,
      },
    });
  });

  it("rifiuta con ActionDataValidationError quando actionData non è conforme allo schema missiva", async () => {
    const feature = mockFeature({ id: 9, campaignId: 1, featureData: {} });

    await expect(
      createMasterMissiveAction(prismaClient, {
        feature,
        actionData: { description: "Manca receiverCharacterId" },
        masterUserId: "master-1",
      })
    ).rejects.toBeInstanceOf(ActionDataValidationError);
    expect(prismaMock.action.create).not.toHaveBeenCalled();
  });

  it("rifiuta con MissiveReceiverNotFoundError se il destinatario non esiste nella campagna", async () => {
    const feature = mockFeature({ id: 9, campaignId: 1, featureData: {} });
    prismaMock.character.findUnique.mockResolvedValue(null);

    await expect(
      createMasterMissiveAction(prismaClient, {
        feature,
        actionData: {
          description: "Un avviso a nome del master",
          subject: "Oggetto",
          receiverCharacterId: 999,
        },
        masterUserId: "master-1",
      })
    ).rejects.toBeInstanceOf(MissiveReceiverNotFoundError);
    expect(prismaMock.action.create).not.toHaveBeenCalled();
  });
});

// T-0xx, missive "a nome del master" rispondibili: SOLO lo stesso master che
// ha scritto la radice del thread può raccogliere il turno — mai un master
// diverso della stessa campagna, mai il `receiverCharacterId` dichiarato dal
// client.
describe("createMasterMissiveAction — risposta a un PG", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubPassthroughTransaction();
  });

  function mockThreadTurnOfMaster(authorUserId: string) {
    prismaMock.action.findFirst.mockResolvedValue({
      characterId: null,
      authorUserId,
      actionData: {
        subject: "Un avviso a nome del master",
        description: "Ciao",
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
          description: "Risposta",
          receiverUserId: authorUserId,
          readDate: null,
          threadRootId: 1,
        },
        creationDate: new Date("2024-03-01T10:00:00.000Z"),
      },
    ] as never);
  }

  it("il master giusto crea la risposta con receiverCharacterId risolto server-side", async () => {
    mockThreadTurnOfMaster("master-1");
    const feature = mockFeature({
      id: 9,
      campaignId: 1,
      featureData: { canAnswer: true, canAnswerThread: true },
    });
    prismaMock.action.create.mockResolvedValue(
      mockAction({ id: 103, characterId: null, featureId: 9 })
    );
    // Notifica (T-0xx): proprietario del PG destinatario (`id: 20`,
    // `expectedReceiverCharacterId` risolto da `getReplyEligibility`).
    prismaMock.character.findUnique.mockResolvedValue(
      mockCharacter({ id: 20, campaignId: 1, userId: "player-1" })
    );

    await createMasterMissiveAction(prismaClient, {
      feature,
      actionData: {
        subject: "Ignorato",
        description: "Risposta del master",
        threadRootId: 1,
        receiverCharacterId: 999, // dichiarato dal client, mai fidato
      },
      masterUserId: "master-1",
    });

    expect(prismaMock.action.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          characterId: null,
          authorUserId: "master-1",
          actionData: expect.objectContaining({ receiverCharacterId: 20 }),
        }),
      })
    );
    expect(prismaMock.notification.create).toHaveBeenCalledWith({
      data: {
        userId: "player-1",
        campaignId: 1,
        type: "missive",
        entityId: 103,
      },
    });
  });

  it("un master diverso da quello che ha scritto la radice viene rifiutato con MissiveReplyNotAllowedError", async () => {
    mockThreadTurnOfMaster("master-1");
    const feature = mockFeature({
      id: 9,
      campaignId: 1,
      featureData: { canAnswer: true, canAnswerThread: true },
    });

    await expect(
      createMasterMissiveAction(prismaClient, {
        feature,
        actionData: {
          subject: "Ignorato",
          description: "Risposta di un master diverso",
          threadRootId: 1,
        },
        masterUserId: "master-2",
      })
    ).rejects.toBeInstanceOf(MissiveReplyNotAllowedError);
    expect(prismaMock.action.create).not.toHaveBeenCalled();
  });
});

// Comunicazione (T-0xx, `communication: true`): smistata da
// `createMasterMissiveAction` verso il percorso dedicato, nessuna
// risoluzione di destinatario (non esiste), nessuno spending di punti
// (stesso "a nome del master" delle missive singole).
describe("createMasterMissiveAction — comunicazione", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Fan-out notifiche (T-0xx): nessun PG attivo per default, i singoli
    // test che verificano il fan-out sovrascrivono con `mockResolvedValueOnce`.
    prismaMock.character.findMany.mockResolvedValue([]);
  });

  it("crea un'unica Action con characterId: null e communication: true, senza risolvere alcun destinatario", async () => {
    const feature = mockFeature({ id: 9, campaignId: 1, featureData: {} });
    prismaMock.action.create.mockResolvedValue(
      mockAction({
        id: 51,
        characterId: null,
        featureId: 9,
        actionData: {
          subject: "Avviso a tutti",
          description: "Contenuto",
          communication: true,
          readByCharacterIds: [],
        },
      })
    );

    const result = await createMasterMissiveAction(prismaClient, {
      feature,
      actionData: {
        subject: "Avviso a tutti",
        description: "Contenuto",
        communication: true,
      },
      masterUserId: "master-1",
    });

    expect(result.action.characterId).toBeNull();
    // `masterUserId` NON è propagato al ramo Comunicazione (decisione
    // deliberata, vedi il commento su `createMasterMissiveAction`): sta
    // sempre in "Posta in arrivo", non partecipa mai al filtro "Inviate".
    expect(prismaMock.action.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        characterId: null,
        featureId: 9,
        authorUserId: null,
      }),
    });
    // Nessuna risoluzione del destinatario: una Comunicazione non ne ha uno.
    expect(prismaMock.character.findUnique).not.toHaveBeenCalled();
  });

  it("notifica ogni PG attivo della campagna, deduplicando per userId (T-0xx)", async () => {
    const feature = mockFeature({ id: 9, campaignId: 1, featureData: {} });
    prismaMock.action.create.mockResolvedValue(
      mockAction({ id: 51, characterId: null, featureId: 9 })
    );
    // Mario ha due PG attivi (dedup atteso a un solo userId), Luigi uno solo
    // PARCHEGGIATO (`parkDate` valorizzato, escluso: `getCharacterStatus`
    // non torna "approved").
    prismaMock.character.findMany.mockResolvedValueOnce([
      mockCharacter({ id: 1, userId: "mario", approvalDate: new Date() }),
      mockCharacter({ id: 2, userId: "mario", approvalDate: new Date() }),
      mockCharacter({
        id: 3,
        userId: "luigi",
        approvalDate: new Date(),
        parkDate: new Date(),
      }),
    ]);

    await createMasterMissiveAction(prismaClient, {
      feature,
      actionData: {
        subject: "Avviso",
        description: "Contenuto",
        communication: true,
      },
      masterUserId: "master-1",
    });

    expect(prismaMock.notification.createMany).toHaveBeenCalledWith({
      data: [{ userId: "mario", campaignId: 1, type: "missive", entityId: 51 }],
    });
  });

  it("rifiuta con ActionDataValidationError quando manca subject/description", async () => {
    const feature = mockFeature({ id: 9, campaignId: 1, featureData: {} });

    await expect(
      createMasterMissiveAction(prismaClient, {
        feature,
        actionData: { communication: true },
        masterUserId: "master-1",
      })
    ).rejects.toBeInstanceOf(ActionDataValidationError);
    expect(prismaMock.action.create).not.toHaveBeenCalled();
  });
});

// Campo libero (T-0xx, `receiverFreeText`): smistata da
// `createMasterMissiveAction` verso il proprio percorso dedicato, prima del
// fallback al ramo reale — nessuna risoluzione di destinatario (non è un
// `Character`), nessuno spending di punti (stesso "a nome del master").
describe("createMasterMissiveAction — campo libero", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("crea un'Action con characterId: null e receiverFreeText, senza risolvere alcun Character", async () => {
    const feature = mockFeature({ id: 9, campaignId: 1, featureData: {} });
    prismaMock.action.create.mockResolvedValue(
      mockAction({
        id: 52,
        characterId: null,
        featureId: 9,
        actionData: {
          subject: "Avviso al taverniere",
          description: "Contenuto",
          receiverFreeText: "Il taverniere",
          readDate: null,
        },
      })
    );

    const result = await createMasterMissiveAction(prismaClient, {
      feature,
      actionData: {
        subject: "Avviso al taverniere",
        description: "Contenuto",
        receiverFreeText: "Il taverniere",
      },
      masterUserId: "master-1",
    });

    expect(result.action.characterId).toBeNull();
    expect(prismaMock.action.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        characterId: null,
        featureId: 9,
        authorUserId: "master-1",
      }),
    });
    expect(prismaMock.character.findUnique).not.toHaveBeenCalled();
    // Nessuna notifica sul ramo Campo libero (T-0xx): nessun destinatario
    // reale a cui indirizzarla.
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });

  it("rifiuta con ActionDataValidationError quando receiverFreeText è vuoto", async () => {
    const feature = mockFeature({ id: 9, campaignId: 1, featureData: {} });

    await expect(
      createMasterMissiveAction(prismaClient, {
        feature,
        actionData: {
          subject: "Oggetto",
          description: "Contenuto",
          receiverFreeText: "   ",
        },
        masterUserId: "master-1",
      })
    ).rejects.toBeInstanceOf(ActionDataValidationError);
    expect(prismaMock.action.create).not.toHaveBeenCalled();
  });
});

describe("isFreeReceiverMissive", () => {
  it("riconosce un actionData con receiverFreeText stringa", () => {
    expect(isFreeReceiverMissive({ receiverFreeText: "Il taverniere" })).toBe(
      true
    );
  });

  it("è false per il ramo reale, la Comunicazione o un valore non valido", () => {
    expect(isFreeReceiverMissive({ receiverCharacterId: 5 })).toBe(false);
    expect(isFreeReceiverMissive({ communication: true })).toBe(false);
    expect(isFreeReceiverMissive(null)).toBe(false);
    expect(isFreeReceiverMissive("non un oggetto")).toBe(false);
  });
});
