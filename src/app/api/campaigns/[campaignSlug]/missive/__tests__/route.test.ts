import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { Prisma, Role } from "@prisma/client";
import { GET } from "../route";
import { mockCampaign, mockCharacter } from "@/test/helpers/prisma-fixtures";
// `vi.mock` è hoisted sopra gli import: questi import risolvono sempre ai
// moduli mockati sotto, stesso pattern degli altri test di route.
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    campaign: { findFirst: vi.fn() },
    grant: { findUnique: vi.fn() },
    character: { findMany: vi.fn() },
    action: { findMany: vi.fn() },
  },
}));

const buildParams = (campaignSlug: string) => ({
  params: Promise.resolve({ campaignSlug }),
});

function buildRequest(query = "") {
  return new NextRequest(
    `http://localhost/api/campaigns/campaign-a/missive${query}`
  );
}

const campaignA = {
  ...mockCampaign({ id: 1, slug: "campaign-a" }),
  organization: { slug: "arcana-domine" },
};

function asMaster() {
  (auth.api.getSession as unknown as Mock).mockResolvedValue({
    user: { id: "user-master", email: "master@example.com" },
  });
  (prisma.grant.findUnique as Mock).mockResolvedValue({
    userId: "user-master",
    campaignId: 1,
    role: Role.master,
  });
}

function asPlayer() {
  (auth.api.getSession as unknown as Mock).mockResolvedValue({
    user: { id: "user-1", email: "player@example.com" },
  });
  (prisma.grant.findUnique as Mock).mockResolvedValue(null);
}

// Supporter = "helper" nel linguaggio prodotto (`roleDefinitions.ts`): vede
// tutto ma non modifica nulla. Regressione di un bug per cui la visibilità
// missive controllava solo master/head_master (`isUserCampaignMaster`),
// trattando un supporter come un giocatore qualunque.
function asSupporter() {
  (auth.api.getSession as unknown as Mock).mockResolvedValue({
    user: { id: "user-supporter", email: "supporter@example.com" },
  });
  (prisma.grant.findUnique as Mock).mockResolvedValue({
    userId: "user-supporter",
    campaignId: 1,
    role: Role.supporter,
  });
}

const missiveAction = (overrides?: {
  id?: number;
  characterId?: number | null;
  receiverCharacterId?: number;
  author?: { name: string } | null;
}) => ({
  id: overrides?.id ?? 1,
  characterId: overrides?.characterId ?? 10,
  featureId: 5,
  creationDate: new Date("2024-06-01"),
  actionData: {
    subject: "Un avviso",
    description: "<p>Contenuto</p>",
    receiverCharacterId: overrides?.receiverCharacterId ?? 20,
  },
  character:
    overrides?.characterId === null
      ? null
      : {
          id: overrides?.characterId ?? 10,
          name: "Aldric",
          avatar: null,
          user: { name: "Mario Rossi" },
        },
  author: overrides?.author ?? null,
});

describe("GET /api/campaigns/[campaignSlug]/missive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await GET(buildRequest(), buildParams("campaign-a"));

    expect(response.status).toBe(401);
  });

  it("returns 404 for an unknown campaign slug", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(null);

    const response = await GET(buildRequest(), buildParams("campaign-a"));

    expect(response.status).toBe(404);
  });

  it("returns 400 for a malformed query param", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);

    const response = await GET(
      buildRequest("?dateFrom=not-a-date"),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(400);
  });

  // Regola prodotto aggiornata (T-0xx): un master senza ALCUN personaggio
  // proprio in questa campagna vede comunque la Comunicazione nella propria
  // "Posta in arrivo" di default — uno staff di campagna non ha bisogno di
  // possedere un personaggio attivo (né PG né PNG) per vedere gli annunci
  // broadcast, a differenza di un giocatore. L'`OR` risolve quindi alla sola
  // condizione Comunicazione, mai al sentinel `{ id: -1 }` (che per un
  // master non può più verificarsi, vedi `buildBoxWhere`).
  it("lists the Comunicazione in the default box for a master with no own character in this campaign (regola aggiornata: nessun gate su personaggi attivi)", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findMany as Mock).mockResolvedValue([]);
    // Prima chiamata (`listUserCharacters`, PG propri del master): nessuno.
    // Seconda chiamata (`campaignCharacters`, dentro
    // `listMissivesForCampaign`, per risolvere gli avatar dei destinatari
    // nelle opzioni filtro): irrilevante qui, nessun personaggio.
    (prisma.character.findMany as Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const response = await GET(buildRequest(), buildParams("campaign-a"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.missives).toHaveLength(0);
    // Calcolato server-side (mai dedotto lato client): decide se mostrare
    // la terza tab "Tutte le missive" in `MissiveList.tsx`.
    expect(body.viewerIsMaster).toBe(true);
    // Un master risolve SEMPRE i propri personaggi (`listUserCharacters`,
    // T-0xx: un master/super-admin può possedere un PG reale nella stessa
    // campagna, vedi `ownCharacterIds` in `missive.repository.ts`), quindi
    // `character.findMany` è chiamato due volte: una per i propri PG, una
    // per i personaggi della campagna (avatar destinatari).
    expect(prisma.character.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.action.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.action.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          feature: { campaignId: 1, featureType: { functionName: "missive" } },
          OR: [{ actionData: { path: ["communication"], equals: true } }],
        }),
      })
    );
  });

  it("box='sent' for a master with no own character lists only missives authored by the master, excluding Comunicazioni (characterId: null AND NOT communication, NULL-safe)", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findMany as Mock).mockResolvedValue([
      missiveAction({ characterId: null }),
    ]);
    (prisma.character.findMany as Mock).mockResolvedValue([]);

    const response = await GET(
      buildRequest("?box=sent"),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(200);
    // Nessun PG proprio (`ownCharacterIds: []`): l'`OR` include comunque il
    // ramo `characterId: { in: [] } }` (nessun match aggiuntivo, nessuna
    // regressione). Il ramo `NOT communication` esclude la Comunicazione
    // anche se scritta "a nome del master" (chiarimento post-fix: sta
    // sempre in "Posta in arrivo") — `not: Prisma.DbNull`, non
    // `equals: true`, per via della semantica NULL a tre valori di SQL su
    // una chiave quasi mai presente (bug reale trovato in produzione,
    // vedi `buildBoxWhere`). `authorUserId: "user-master"` (scenario
    // Marco/Pippo): il ramo "a nome del master" si restringe al viewer
    // stesso, non a chiunque abbia scritto "a nome del master".
    expect(prisma.action.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            {
              characterId: null,
              authorUserId: "user-master",
              NOT: {
                actionData: { path: ["communication"], not: Prisma.DbNull },
              },
            },
            { characterId: { in: [] } },
          ],
        }),
      })
    );
  });

  it("box='sent' for a master WITH an own character in this campaign includes missives authored by that character too (bug reale in produzione)", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findMany as Mock).mockResolvedValue([
      missiveAction({ id: 2, characterId: 99 }),
    ]);
    // Il master possiede un proprio PG (Basilio, id 99) in questa campagna.
    (prisma.character.findMany as Mock)
      .mockResolvedValueOnce([{ id: 99, name: "Basilio" }])
      .mockResolvedValueOnce([]);

    const response = await GET(
      buildRequest("?box=sent"),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(200);
    expect(prisma.action.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            {
              characterId: null,
              authorUserId: "user-master",
              NOT: {
                actionData: { path: ["communication"], not: Prisma.DbNull },
              },
            },
            { characterId: { in: [99] } },
          ],
        }),
      })
    );
  });

  // Scenario reale segnalato dall'utente: Marco e Pippo scrivono entrambi
  // "a nome del master" allo stesso PG — in "Inviate" ciascuno deve vedere
  // SOLO la propria, mai quella dell'altro master.
  it("box='sent' for master Marco restricts to his own authorUserId, excluding master Pippo's missive to the same character", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "marco-id", email: "marco@example.com" },
    });
    (prisma.grant.findUnique as Mock).mockResolvedValue({
      userId: "marco-id",
      campaignId: 1,
      role: Role.master,
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    // Il mock ignora comunque il `where` (non è un vero DB), ma la `where`
    // costruita è quella che conta: verificata sotto.
    (prisma.action.findMany as Mock).mockResolvedValue([
      missiveAction({ characterId: null, author: { name: "Marco Verdi" } }),
    ]);
    (prisma.character.findMany as Mock).mockResolvedValue([]);

    const response = await GET(
      buildRequest("?box=sent"),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(200);
    expect(prisma.action.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            expect.objectContaining({
              characterId: null,
              authorUserId: "marco-id",
            }),
            { characterId: { in: [] } },
          ],
        }),
      })
    );
  });

  it("box='inbox' for a master WITH an own character matches the Comunicazione condition OR missives addressed to that character — not missives authored by other players in general (bug reale in produzione, cambio d'asse)", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findMany as Mock).mockResolvedValue([]);
    (prisma.character.findMany as Mock)
      .mockResolvedValueOnce([
        {
          id: 99,
          name: "Basilio",
          type: "pg",
          approvalDate: new Date("2024-01-01"),
          deathDate: null,
          parkDate: null,
        },
      ])
      .mockResolvedValueOnce([]);

    const response = await GET(
      buildRequest("?box=inbox"),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(200);
    expect(prisma.action.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { actionData: { path: ["communication"], equals: true } },
            { actionData: { path: ["receiverCharacterId"], equals: 99 } },
          ],
        }),
      })
    );
  });

  // Regola prodotto aggiornata (T-0xx): un master vede SEMPRE la
  // Comunicazione nella propria "Posta in arrivo", ANCHE se il suo unico
  // personaggio proprio in campagna è un PNG (non un PG) — nessun gate su
  // tipo/stato dei personaggi per lo staff di campagna, a differenza del
  // ramo giocatore (`hasActiveCharacter` in `missive.repository.ts`, che
  // per un master non esiste più).
  it("box='inbox' for a master with an own character that is a PNG (not a PG) still includes the Comunicazione condition", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findMany as Mock).mockResolvedValue([]);
    (prisma.character.findMany as Mock)
      .mockResolvedValueOnce([
        {
          id: 88,
          name: "Un PNG del master",
          type: "png",
          approvalDate: new Date("2024-01-01"),
          deathDate: null,
          parkDate: null,
        },
      ])
      .mockResolvedValueOnce([]);

    const response = await GET(
      buildRequest("?box=inbox"),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(200);
    expect(prisma.action.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { actionData: { path: ["communication"], equals: true } },
            { actionData: { path: ["receiverCharacterId"], equals: 88 } },
          ],
        }),
      })
    );
  });

  it("box='all' for a master applies no extra direction filter (sees everything, including traffic between other players)", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findMany as Mock).mockResolvedValue([missiveAction()]);
    (prisma.character.findMany as Mock)
      .mockResolvedValueOnce([{ id: 99, name: "Basilio" }])
      .mockResolvedValueOnce([]);

    const response = await GET(
      buildRequest("?box=all"),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(200);
    expect(prisma.action.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          feature: { campaignId: 1, featureType: { functionName: "missive" } },
        },
      })
    );
  });

  it("exposes masterSenderName for a master viewer in box='all', null for a Comunicazione even with an author", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findMany as Mock).mockResolvedValue([
      missiveAction({
        id: 1,
        characterId: null,
        author: { name: "Marco Verdi" },
      }),
      {
        id: 2,
        characterId: null,
        featureId: 5,
        creationDate: new Date("2024-06-02"),
        actionData: {
          subject: "Avviso a tutti",
          description: "<p>Ciao</p>",
          communication: true,
          readByCharacterIds: [],
        },
        character: null,
        // Oggi mai valorizzato per una Comunicazione (vedi
        // `createCommunicationMissiveAction`), ma il resolver deve
        // comunque escluderla esplicitamente via `isCommunicationMissive`,
        // non solo per assenza di `author` — verificato qui anche con un
        // `author` presente per costruzione del test.
        author: { name: "Pippo Bianchi" },
      },
    ]);
    (prisma.character.findMany as Mock).mockResolvedValue([]);

    const response = await GET(
      buildRequest("?box=all"),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.missives[0].masterSenderName).toBe("Marco Verdi");
    expect(body.missives[1].masterSenderName).toBeNull();
  });

  it("never exposes masterSenderName to a non-master viewer, even when the underlying row has an author", async () => {
    asPlayer();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        ...mockCharacter({ id: 10, name: "Aldric", userId: "user-1" }),
        user: { name: "Mario Rossi" },
      },
    ]);
    (prisma.action.findMany as Mock).mockResolvedValue([
      missiveAction({
        characterId: null,
        receiverCharacterId: 10,
        author: { name: "Marco Verdi" },
      }),
    ]);

    const response = await GET(buildRequest(), buildParams("campaign-a"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.missives[0].masterSenderName).toBeNull();
  });

  it("lists every missive of the campaign for a supporter/helper too, not just master/head_master", async () => {
    asSupporter();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findMany as Mock).mockResolvedValue([missiveAction()]);
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        id: 20,
        name: "Aurelio",
        avatar: null,
        type: "pg",
        user: { name: "Player Aurelio" },
      },
    ]);

    const response = await GET(buildRequest(), buildParams("campaign-a"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.missives).toHaveLength(1);
    // Nessun filtro di visibilità aggiuntivo, stesso trattamento di un
    // master: la `where` non contiene un `OR` di scoping personaggi.
    expect(prisma.action.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          feature: { campaignId: 1, featureType: { functionName: "missive" } },
        }),
      })
    );
  });

  it("maps a master missive (characterId: null) to a null sender", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findMany as Mock).mockResolvedValue([
      missiveAction({ characterId: null }),
    ]);
    // Ora richiesto anche per un master (`listUserCharacters`, PG propri).
    (prisma.character.findMany as Mock).mockResolvedValue([]);

    const response = await GET(buildRequest(), buildParams("campaign-a"));

    const body = await response.json();
    expect(body.missives[0].sender).toBeNull();
  });

  it("scopes the query to the player's own characters (sent or received)", async () => {
    asPlayer();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        ...mockCharacter({ id: 10, name: "Aldric", userId: "user-1" }),
        user: { name: "Mario Rossi" },
      },
    ]);
    (prisma.action.findMany as Mock).mockResolvedValue([missiveAction()]);

    const response = await GET(buildRequest(), buildParams("campaign-a"));

    expect(response.status).toBe(200);
    const body = await response.json();
    // Calcolato server-side: decide se mostrare la terza tab "Tutte le
    // missive" (master-only) in `MissiveList.tsx` — un giocatore non deve
    // vederla mai.
    expect(body.viewerIsMaster).toBe(false);
    // Una volta per `listUserCharacters` (PG propri, per lo scoping) e una
    // volta per i personaggi della campagna (avatar dei destinatari nelle
    // opzioni filtro).
    expect(prisma.character.findMany).toHaveBeenCalledTimes(2);
    // Il PG (id 10, `mockCharacter` di default: approvato, tipo PG) rende il
    // giocatore idoneo a vedere anche le Comunicazioni (`hasActiveCharacter`,
    // regola aggiornata: PG o PNG indifferentemente), quindi l'OR include
    // anche quella condizione. Nessun `box` in query
    // string → default "Posta in arrivo": esclude le missive scritte da un
    // proprio personaggio, MA include quelle a `characterId: null` (vedi
    // `buildBoxWhere` — `AND: [{ OR: [...] } ]`, non un `NOT`/`notIn`
    // semplice, per via della semantica NULL di SQL).
    expect(prisma.action.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { characterId: { in: [10] } },
            {
              actionData: { path: ["receiverCharacterId"], equals: 10 },
            },
            { actionData: { path: ["communication"], equals: true } },
          ],
          AND: [
            { OR: [{ characterId: null }, { characterId: { notIn: [10] } }] },
          ],
        }),
      })
    );
  });

  it("box='sent' for a player lists only missives authored by one of their own characters", async () => {
    asPlayer();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        ...mockCharacter({ id: 10, name: "Aldric", userId: "user-1" }),
        user: { name: "Mario Rossi" },
      },
    ]);
    (prisma.action.findMany as Mock).mockResolvedValue([missiveAction()]);

    const response = await GET(
      buildRequest("?box=sent"),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(200);
    expect(prisma.action.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          characterId: { in: [10] },
        }),
      })
    );
  });

  it("does not add the communication condition when the player has no active character", async () => {
    asPlayer();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        ...mockCharacter({
          id: 10,
          name: "Aldric",
          userId: "user-1",
          deathDate: new Date("2024-01-05"),
        }),
        user: { name: "Mario Rossi" },
      },
    ]);
    (prisma.action.findMany as Mock).mockResolvedValue([missiveAction()]);

    await GET(buildRequest(), buildParams("campaign-a"));

    expect(prisma.action.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { characterId: { in: [10] } },
            {
              actionData: { path: ["receiverCharacterId"], equals: 10 },
            },
          ],
        }),
      })
    );
  });

  // Regola prodotto aggiornata (T-0xx): un giocatore il cui UNICO
  // personaggio attivo è un PNG (non un PG) vede comunque la Comunicazione
  // — prima il gate era ristretto ai soli PG, ora `hasActiveCharacter` non
  // guarda più il `type` (vedi `missive.repository.ts`).
  it("adds the communication condition when the player's only active character is a PNG (not a PG)", async () => {
    asPlayer();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        ...mockCharacter({
          id: 10,
          name: "Un PNG del giocatore",
          userId: "user-1",
          type: "png",
        }),
        user: { name: "Mario Rossi" },
      },
    ]);
    (prisma.action.findMany as Mock).mockResolvedValue([missiveAction()]);

    await GET(buildRequest(), buildParams("campaign-a"));

    expect(prisma.action.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { characterId: { in: [10] } },
            {
              actionData: { path: ["receiverCharacterId"], equals: 10 },
            },
            { actionData: { path: ["communication"], equals: true } },
          ],
        }),
      })
    );
  });

  it("includes isCommunication in every list item", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findMany as Mock).mockResolvedValue([missiveAction()]);
    (prisma.character.findMany as Mock).mockResolvedValue([]);

    const response = await GET(buildRequest(), buildParams("campaign-a"));

    const body = await response.json();
    expect(body.missives[0]).toMatchObject({ isCommunication: false });
  });

  it("exposes isReply: false/threadRootId: null for a normal (non-reply) missive", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findMany as Mock).mockResolvedValue([missiveAction()]);
    (prisma.character.findMany as Mock).mockResolvedValue([]);

    const response = await GET(buildRequest(), buildParams("campaign-a"));

    const body = await response.json();
    expect(body.missives[0]).toMatchObject({
      isReply: false,
      threadRootId: null,
    });
  });

  // T-0xx "risposte alle missive": una risposta compare in lista come una
  // riga qualunque (è una vera `Action`), con `isReply`/`threadRootId`
  // valorizzati dal solo `actionData.threadRootId` — `MissiveRow.tsx` li usa
  // per puntare sempre alla missiva radice, mai a una pagina propria.
  it("exposes isReply: true/threadRootId for a thread reply", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findMany as Mock).mockResolvedValue([
      {
        ...missiveAction({ id: 2, characterId: 20, receiverCharacterId: 10 }),
        actionData: {
          subject: "Re: Un avviso",
          description: "<p>Risposta</p>",
          receiverCharacterId: 10,
          threadRootId: 1,
        },
      },
    ]);
    (prisma.character.findMany as Mock).mockResolvedValue([]);

    const response = await GET(buildRequest(), buildParams("campaign-a"));

    const body = await response.json();
    expect(body.missives[0]).toMatchObject({
      isReply: true,
      threadRootId: 1,
    });
  });

  it("exposes isFreeReceiver/receiverFreeText for a Campo libero missive, master viewer sees it", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findMany as Mock).mockResolvedValue([
      {
        id: 2,
        characterId: 10,
        featureId: 5,
        creationDate: new Date("2024-06-02"),
        actionData: {
          subject: "Un avviso al taverniere",
          description: "<p>Ciao</p>",
          receiverFreeText: "Il taverniere",
        },
        character: {
          id: 10,
          name: "Aldric",
          avatar: null,
          user: { name: "Mario Rossi" },
        },
      },
    ]);
    (prisma.character.findMany as Mock).mockResolvedValue([]);

    const response = await GET(buildRequest(), buildParams("campaign-a"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.missives[0]).toMatchObject({
      isCommunication: false,
      isFreeReceiver: true,
      receiverFreeText: "Il taverniere",
      receiver: null,
    });
  });
});
