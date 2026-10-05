import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { GET, PATCH } from "../route";
import { mockCampaign, mockCharacter } from "@/test/helpers/prisma-fixtures";
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
    action: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  },
}));

const buildParams = (campaignSlug: string, id: string) => ({
  params: Promise.resolve({ campaignSlug, id }),
});

function buildRequest() {
  return new NextRequest("http://localhost/api/campaigns/campaign-a/missive/1");
}

function buildPatchRequest(body?: unknown) {
  return new NextRequest(
    "http://localhost/api/campaigns/campaign-a/missive/1",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }
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

const missiveAction = () => ({
  id: 1,
  characterId: 10,
  featureId: 5,
  creationDate: new Date("2024-06-01"),
  actionData: {
    subject: "Un avviso",
    description: "<p>Contenuto</p>",
    receiverCharacterId: 20,
  },
  character: {
    id: 10,
    name: "Aldric",
    avatar: null,
    user: { name: "Mario Rossi" },
  },
  author: null,
});

describe("GET /api/campaigns/[campaignSlug]/missive/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Il thread (`getThreadReplies`, T-0xx "risposte alle missive") è
    // caricato per OGNI missiva risolta che non sia essa stessa una
    // risposta — default "nessuna risposta" per i test che non se ne
    // occupano esplicitamente, altrimenti `prisma.action.findMany` non
    // mockato romperebbe ogni test esistente in questo file.
    (prisma.action.findMany as Mock).mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await GET(buildRequest(), buildParams("campaign-a", "1"));

    expect(response.status).toBe(401);
  });

  it("returns 400 for a non-numeric id", async () => {
    asMaster();

    const response = await GET(
      buildRequest(),
      buildParams("campaign-a", "abc")
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 for an unknown campaign slug", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(null);

    const response = await GET(buildRequest(), buildParams("campaign-a", "1"));

    expect(response.status).toBe(404);
  });

  it("returns the missive detail for a master", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findFirst as Mock).mockResolvedValue(missiveAction());
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        id: 20,
        name: "Aurelio",
        avatar: null,
        type: "pg",
        user: { name: "Player Aurelio" },
      },
    ]);

    const response = await GET(buildRequest(), buildParams("campaign-a", "1"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      id: 1,
      subject: "Un avviso",
      description: "<p>Contenuto</p>",
      receiver: { id: 20, name: "Aurelio", userName: "Player Aurelio" },
      sender: { id: 10, name: "Aldric", userName: "Mario Rossi" },
      isCommunication: false,
      readByCharacters: [],
    });
  });

  // Scenario reale segnalato dall'utente: `MissiveReader` deve mostrare lo
  // username del master autore accanto a "Master", indipendentemente da
  // quale tab ha portato lì il viewer (dettaglio raggiungibile anche per
  // id diretto) — ma MAI a un giocatore.
  it("exposes masterSenderName for a master-authored missive when viewed by a master, null for a player viewing the same missive", async () => {
    const masterAuthoredMissive = {
      id: 4,
      characterId: null,
      featureId: 5,
      creationDate: new Date("2024-06-01"),
      actionData: {
        subject: "Convocazione",
        description: "<p>Presentati a corte.</p>",
        receiverCharacterId: 20,
      },
      character: null,
      author: { name: "Marco Verdi" },
    };

    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findFirst as Mock).mockResolvedValue(masterAuthoredMissive);
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        id: 20,
        name: "Aurelio",
        avatar: null,
        type: "pg",
        user: { name: "Player Aurelio" },
      },
    ]);

    const masterResponse = await GET(
      buildRequest(),
      buildParams("campaign-a", "4")
    );
    const masterBody = await masterResponse.json();
    expect(masterBody.masterSenderName).toBe("Marco Verdi");

    asPlayer();
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        ...mockCharacter({ id: 20, userId: "user-1" }),
        user: { name: "Aurelio's player" },
      },
    ]);
    (prisma.action.findFirst as Mock).mockResolvedValue(masterAuthoredMissive);

    const playerResponse = await GET(
      buildRequest(),
      buildParams("campaign-a", "4")
    );
    const playerBody = await playerResponse.json();
    expect(playerBody.masterSenderName).toBeNull();
  });

  it("returns 404 (not another status) when the missive is not visible to the player", async () => {
    asPlayer();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      mockCharacter({ id: 99, name: "Someone Else", userId: "user-1" }),
    ]);
    // `getMissiveByIdScoped` applica il filtro di visibilità nella `where`:
    // un mock che restituisce sempre `null` simula il caso "non trovato
    // dentro lo scope del viewer", indipendentemente da come Prisma
    // valuterebbe realmente la `where`.
    (prisma.action.findFirst as Mock).mockResolvedValue(null);

    const response = await GET(buildRequest(), buildParams("campaign-a", "1"));

    expect(response.status).toBe(404);
    expect(prisma.action.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 1,
          OR: [
            { characterId: { in: [99] } },
            {
              actionData: {
                path: ["receiverCharacterId"],
                equals: 99,
              },
            },
            // `mockCharacter` di default è un PG approvato: idoneo a
            // vedere anche le Comunicazioni (`hasActiveCharacter`).
            { actionData: { path: ["communication"], equals: true } },
          ],
        }),
      })
    );
  });

  it("exposes readByCharacters for a master viewing a communication, empty for a player", async () => {
    const communication = {
      id: 2,
      characterId: null,
      featureId: 5,
      creationDate: new Date("2024-06-01"),
      actionData: {
        subject: "Avviso a tutti",
        description: "<p>Ciao a tutti</p>",
        communication: true,
        readByCharacterIds: [20],
      },
      character: null,
    };

    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findFirst as Mock).mockResolvedValue(communication);
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        id: 20,
        name: "Aurelio",
        avatar: null,
        type: "pg",
        user: { name: "Player Aurelio" },
      },
    ]);

    const masterResponse = await GET(
      buildRequest(),
      buildParams("campaign-a", "2")
    );
    const masterBody = await masterResponse.json();
    expect(masterBody.isCommunication).toBe(true);
    expect(masterBody.readByCharacters).toEqual([
      {
        id: 20,
        name: "Aurelio",
        avatar: null,
        userName: "Player Aurelio",
        type: "pg",
      },
    ]);

    asPlayer();
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        ...mockCharacter({ id: 20, userId: "user-1" }),
        user: { name: "Player Aurelio" },
      },
    ]);
    (prisma.action.findFirst as Mock).mockResolvedValue(communication);

    const playerResponse = await GET(
      buildRequest(),
      buildParams("campaign-a", "2")
    );
    const playerBody = await playerResponse.json();
    expect(playerBody.readByCharacters).toEqual([]);
  });

  it("exposes isFreeReceiver/receiverFreeText for a Campo libero missive, receiver null", async () => {
    const freeReceiverMissive = {
      id: 3,
      characterId: 10,
      featureId: 5,
      creationDate: new Date("2024-06-01"),
      actionData: {
        subject: "Un avviso al taverniere",
        description: "<p>Ciao</p>",
        receiverFreeText: "Il taverniere",
        readDate: null,
      },
      character: {
        id: 10,
        name: "Aldric",
        avatar: null,
        user: { name: "Mario Rossi" },
      },
    };

    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findFirst as Mock).mockResolvedValue(freeReceiverMissive);
    (prisma.character.findMany as Mock).mockResolvedValue([]);

    const response = await GET(buildRequest(), buildParams("campaign-a", "3"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      isCommunication: false,
      isFreeReceiver: true,
      receiverFreeText: "Il taverniere",
      receiver: null,
    });
  });

  // T-0xx "risposte alle missive": una missiva root reale espone `thread`
  // (vuoto quando non ha ancora ricevuto risposte).
  it("exposes an empty thread for a real-branch root missive with no replies", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findFirst as Mock).mockResolvedValue(missiveAction());
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        id: 20,
        name: "Aurelio",
        avatar: null,
        type: "pg",
        user: { name: "Player Aurelio" },
      },
    ]);

    const response = await GET(buildRequest(), buildParams("campaign-a", "1"));

    const body = await response.json();
    expect(body).toMatchObject({
      isReply: false,
      threadRootId: null,
      thread: [],
    });
  });

  it("includes every reply in thread, ordered as returned by getThreadReplies", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findFirst as Mock).mockResolvedValue(missiveAction());
    (prisma.action.findMany as Mock).mockResolvedValue([
      {
        id: 2,
        characterId: 20,
        featureId: 5,
        creationDate: new Date("2024-06-02"),
        actionData: {
          subject: "Re: Un avviso",
          description: "<p>Risposta</p>",
          receiverCharacterId: 10,
          threadRootId: 1,
        },
        character: {
          id: 20,
          name: "Aurelio",
          avatar: null,
          user: { name: "Player Aurelio" },
        },
        author: null,
      },
    ]);
    (prisma.character.findMany as Mock).mockResolvedValue([
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
    ]);

    const response = await GET(buildRequest(), buildParams("campaign-a", "1"));

    const body = await response.json();
    expect(body.thread).toHaveLength(1);
    expect(body.thread[0]).toMatchObject({
      id: 2,
      subject: "Re: Un avviso",
      description: "<p>Risposta</p>",
      isReply: true,
      threadRootId: 1,
      sender: { id: 20, name: "Aurelio" },
    });
  });

  // Una missiva che è essa stessa una risposta non ha un concetto di
  // redirect qui (API JSON, non una pagina): restituisce quel singolo
  // messaggio con `thread: []`, mai il thread della sua radice.
  it("returns thread: [] when the resolved missive is itself a reply", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.action.findFirst as Mock).mockResolvedValue({
      id: 2,
      characterId: 20,
      featureId: 5,
      creationDate: new Date("2024-06-02"),
      actionData: {
        subject: "Re: Un avviso",
        description: "<p>Risposta</p>",
        receiverCharacterId: 10,
        threadRootId: 1,
      },
      character: {
        id: 20,
        name: "Aurelio",
        avatar: null,
        user: { name: "Player Aurelio" },
      },
      author: null,
    });
    (prisma.character.findMany as Mock).mockResolvedValue([]);

    const response = await GET(buildRequest(), buildParams("campaign-a", "2"));

    const body = await response.json();
    expect(body).toMatchObject({
      isReply: true,
      threadRootId: 1,
      thread: [],
    });
    // Nessuna query aggiuntiva sul thread: `getThreadReplies` non va
    // chiamata quando la missiva risolta è già essa stessa una risposta.
    expect(prisma.action.findMany).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/campaigns/[campaignSlug]/missive/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await PATCH(
      buildPatchRequest({ description: "<p>Nuovo</p>" }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for a non-numeric id", async () => {
    asMaster();

    const response = await PATCH(
      buildPatchRequest({ description: "<p>Nuovo</p>" }),
      buildParams("campaign-a", "abc")
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for an empty description", async () => {
    asMaster();

    const response = await PATCH(
      buildPatchRequest({ description: "   " }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 for an unknown campaign slug", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(null);

    const response = await PATCH(
      buildPatchRequest({ description: "<p>Nuovo</p>" }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when the missive is not visible to the caller", async () => {
    asPlayer();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      mockCharacter({ id: 99, userId: "user-1" }),
    ]);
    (prisma.action.findFirst as Mock).mockResolvedValue(null);

    const response = await PATCH(
      buildPatchRequest({ description: "<p>Nuovo</p>" }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(404);
    expect(prisma.action.updateMany).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is not the sender of this missive", async () => {
    // "user-1" possiede il PG 20 (il DESTINATARIO di `missiveAction`, non il
    // mittente): la vede, ma non può modificarla.
    asPlayer();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        ...mockCharacter({ id: 20, userId: "user-1" }),
        user: { name: "Aurelio's player" },
      },
    ]);
    (prisma.action.findFirst as Mock).mockResolvedValue(missiveAction());

    const response = await PATCH(
      buildPatchRequest({ description: "<p>Nuovo</p>" }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(403);
    expect(prisma.action.updateMany).not.toHaveBeenCalled();
  });

  it("returns 403 for a Comunicazione, even for a master (no single 'mittente' to authorize)", async () => {
    const communication = {
      id: 2,
      characterId: null,
      featureId: 5,
      creationDate: new Date("2024-06-01"),
      actionData: {
        subject: "Avviso a tutti",
        description: "<p>Ciao a tutti</p>",
        communication: true,
        readByCharacterIds: [],
      },
      character: null,
    };
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([]);
    (prisma.action.findFirst as Mock).mockResolvedValue(communication);

    const response = await PATCH(
      buildPatchRequest({ description: "<p>Nuovo</p>" }),
      buildParams("campaign-a", "2")
    );

    expect(response.status).toBe(403);
    expect(prisma.action.updateMany).not.toHaveBeenCalled();
  });

  it("returns 409 without attempting the update when already read (fast path)", async () => {
    asPlayer();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        ...mockCharacter({ id: 10, userId: "user-1" }),
        user: { name: "Mario Rossi" },
      },
    ]);
    (prisma.action.findFirst as Mock).mockResolvedValue({
      ...missiveAction(),
      actionData: {
        ...missiveAction().actionData,
        readDate: "2024-06-02T10:00:00.000Z",
      },
    });

    const response = await PATCH(
      buildPatchRequest({ description: "<p>Nuovo</p>" }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(409);
    expect(prisma.action.updateMany).not.toHaveBeenCalled();
  });

  it("returns 409 when the recipient reads it concurrently, between the fetch and the conditional write (race)", async () => {
    asPlayer();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        ...mockCharacter({ id: 10, userId: "user-1" }),
        user: { name: "Mario Rossi" },
      },
    ]);
    // Il primo `findFirst` (risoluzione/visibilità) vede ancora `readDate:
    // null`: la lettura concorrente arriva SOLO dopo, prima del secondo
    // `findFirst` dentro `updateMissiveContentIfUnread`.
    (prisma.action.findFirst as Mock).mockResolvedValue(missiveAction());
    (prisma.action.updateMany as Mock).mockResolvedValue({ count: 0 });

    const response = await PATCH(
      buildPatchRequest({ description: "<p>Nuovo</p>" }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toMatch(/letto/i);
  });

  it("updates the description for the sender when still unread", async () => {
    asPlayer();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        ...mockCharacter({ id: 10, userId: "user-1" }),
        user: { name: "Mario Rossi" },
      },
    ]);
    (prisma.action.findFirst as Mock).mockResolvedValue(missiveAction());
    (prisma.action.updateMany as Mock).mockResolvedValue({ count: 1 });

    const response = await PATCH(
      buildPatchRequest({ description: "<p>Nuovo contenuto</p>" }),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ description: "<p>Nuovo contenuto</p>" });
    expect(prisma.action.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 1, characterId: 10 }),
        data: {
          actionData: expect.objectContaining({
            description: "<p>Nuovo contenuto</p>",
          }),
        },
      })
    );
  });
});
