import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { PATCH } from "../route";
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
    action: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

const buildParams = (campaignSlug: string, id: string) => ({
  params: Promise.resolve({ campaignSlug, id }),
});

function buildRequest() {
  return new NextRequest(
    "http://localhost/api/campaigns/campaign-a/missive/1/read",
    { method: "PATCH" }
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

function asPlayer(userId: string) {
  (auth.api.getSession as unknown as Mock).mockResolvedValue({
    user: { id: userId, email: `${userId}@example.com` },
  });
  (prisma.grant.findUnique as Mock).mockResolvedValue(null);
}

// Include sia `character` (letto da `getMissiveByIdScoped`) sia `actionData`
// (letto anche da `markMissiveAsRead`): lo stesso mock di `action.findFirst`
// serve entrambe le chiamate della route, che qui interessa solo come dato
// grezzo, non come query specifica.
const missiveAction = (overrides?: { readDate?: string | null }) => ({
  id: 1,
  characterId: 10,
  featureId: 5,
  creationDate: new Date("2024-06-01"),
  actionData: {
    subject: "Un avviso",
    description: "<p>Contenuto</p>",
    receiverCharacterId: 20,
    readDate: overrides?.readDate ?? null,
  },
  character: {
    id: 10,
    name: "Aldric",
    avatar: null,
    user: { name: "Mario Rossi" },
  },
});

describe("PATCH /api/campaigns/[campaignSlug]/missive/[id]/read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await PATCH(
      buildRequest(),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for a non-numeric id", async () => {
    asMaster();

    const response = await PATCH(
      buildRequest(),
      buildParams("campaign-a", "abc")
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 for an unknown campaign slug", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(null);

    const response = await PATCH(
      buildRequest(),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when the missive is not visible to the caller", async () => {
    asPlayer("user-stranger");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      mockCharacter({ id: 30, campaignId: 1, userId: "user-stranger" }),
    ]);
    (prisma.action.findFirst as Mock).mockResolvedValue(null);

    const response = await PATCH(
      buildRequest(),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(404);
    expect(prisma.action.update).not.toHaveBeenCalled();
  });

  it("returns 403 when the master (not the receiver) tries to mark it read", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    // Il master non possiede alcun PG in questa campagna: nessuno dei suoi
    // personaggi combacia con receiverCharacterId: 20 di `missiveAction`.
    (prisma.character.findMany as Mock).mockResolvedValue([]);
    (prisma.action.findFirst as Mock).mockResolvedValue(missiveAction());

    const response = await PATCH(
      buildRequest(),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(403);
    expect(prisma.action.update).not.toHaveBeenCalled();
  });

  it("marks the missive as read when a master/helper ALSO owns the receiving character", async () => {
    // Regressione: avere un ruolo di campagna amplia la visibilità (vede
    // tutta la campagna), non deve impedire il normale comportamento "il
    // destinatario apre la sua posta" quando il master è anche lui stesso
    // proprietario del PG destinatario.
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        ...mockCharacter({ id: 20, campaignId: 1, userId: "user-master" }),
        user: { name: "Master Character Owner" },
      },
    ]);
    (prisma.action.findFirst as Mock).mockResolvedValue(missiveAction());

    const response = await PATCH(
      buildRequest(),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(200);
    expect(prisma.action.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        actionData: expect.objectContaining({
          receiverCharacterId: 20,
          readDate: expect.any(String),
        }),
      },
    });
  });

  it("returns 403 when the sender (not the receiver) tries to mark it read", async () => {
    // "user-1" possiede il PG 10 (il mittente di `missiveAction`, non il
    // destinatario 20): deve poter VEDERE la missiva (l'ha mandata lui) ma
    // non segnarla come letta.
    asPlayer("user-1");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        ...mockCharacter({ id: 10, campaignId: 1, userId: "user-1" }),
        user: { name: "Mario Rossi" },
      },
    ]);
    (prisma.action.findFirst as Mock).mockResolvedValue(missiveAction());

    const response = await PATCH(
      buildRequest(),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(403);
    expect(prisma.action.update).not.toHaveBeenCalled();
  });

  it("marks the missive as read when the caller owns the receiving character", async () => {
    asPlayer("user-2");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        ...mockCharacter({ id: 20, campaignId: 1, userId: "user-2" }),
        user: { name: "Player Two" },
      },
    ]);
    (prisma.action.findFirst as Mock).mockResolvedValue(missiveAction());

    const response = await PATCH(
      buildRequest(),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(200);
    expect(prisma.action.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        actionData: expect.objectContaining({
          receiverCharacterId: 20,
          readDate: expect.any(String),
        }),
      },
    });
  });

  it("is idempotent: does not call update again when already read", async () => {
    asPlayer("user-2");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        ...mockCharacter({ id: 20, campaignId: 1, userId: "user-2" }),
        user: { name: "Player Two" },
      },
    ]);
    (prisma.action.findFirst as Mock).mockResolvedValue(
      missiveAction({ readDate: "2024-06-02T00:00:00.000Z" })
    );

    const response = await PATCH(
      buildRequest(),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(200);
    expect(prisma.action.update).not.toHaveBeenCalled();
  });
});

// Comunicazione (T-0xx): nessun `receiver` singolo, l'autorizzazione/il
// tracking passano da "almeno un personaggio attivo del chiamante" (PG O
// PNG, regola prodotto aggiornata), non dal possesso del destinatario (vedi
// il commento in testa alla route).
describe("PATCH .../missive/[id]/read — comunicazione", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const communicationAction = (readByCharacterIds: number[] = []) => ({
    id: 1,
    characterId: null,
    featureId: 5,
    creationDate: new Date("2024-06-01"),
    actionData: {
      subject: "Avviso a tutti",
      description: "<p>Ciao a tutti</p>",
      communication: true,
      readByCharacterIds,
    },
    character: null,
  });

  it("marks the communication as read using the caller's active PG", async () => {
    asPlayer("user-2");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        ...mockCharacter({ id: 20, campaignId: 1, userId: "user-2" }),
        user: { name: "Player Two" },
      },
    ]);
    (prisma.action.findFirst as Mock).mockResolvedValue(communicationAction());

    const response = await PATCH(
      buildRequest(),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(200);
    expect(prisma.action.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        actionData: expect.objectContaining({
          readByCharacterIds: [20],
        }),
      },
    });
  });

  // Regola prodotto aggiornata (T-0xx): un PNG attivo basta quanto un PG —
  // il gate non guarda più il `type` del personaggio (vedi
  // `missive.repository.ts`).
  it("marks the communication as read using the caller's active PNG (not just a PG)", async () => {
    asPlayer("user-2");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        ...mockCharacter({
          id: 20,
          campaignId: 1,
          userId: "user-2",
          type: "png",
        }),
        user: { name: "Player Two" },
      },
    ]);
    (prisma.action.findFirst as Mock).mockResolvedValue(communicationAction());

    const response = await PATCH(
      buildRequest(),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(200);
    expect(prisma.action.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        actionData: expect.objectContaining({
          readByCharacterIds: [20],
        }),
      },
    });
  });

  // Bug A (T-0xx, chiarimento post-fix): una persona con PIÙ di un PG
  // attivo nella stessa campagna deve risultare "ha letto" con OGNI suo PG
  // attivo, non solo il primo — prima si passava un solo `characterId`
  // (`activePgCharacters[0]`), lasciando fuori gli altri. Vale sia per un
  // giocatore sia per un master con più PG attivi (qui verificato con un
  // giocatore, la logica non dipende da `isMaster`).
  it("marks the communication as read using ALL of the caller's active PGs, not just the first", async () => {
    asPlayer("user-2");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        ...mockCharacter({ id: 21, campaignId: 1, userId: "user-2" }),
        user: { name: "Player Two" },
      },
      {
        ...mockCharacter({ id: 20, campaignId: 1, userId: "user-2" }),
        user: { name: "Player Two" },
      },
    ]);
    (prisma.action.findFirst as Mock).mockResolvedValue(communicationAction());

    const response = await PATCH(
      buildRequest(),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(200);
    // Ordinati per id (`activePgCharacters.sort`, deterministico) — entrambi
    // i PG attivi del chiamante, non solo `activePgCharacters[0]`.
    expect(prisma.action.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        actionData: expect.objectContaining({
          readByCharacterIds: [20, 21],
        }),
      },
    });
  });

  it("returns 403 when the caller has no active character", async () => {
    asPlayer("user-2");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    // PG deceduto: nessun personaggio attivo.
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        ...mockCharacter({
          id: 20,
          campaignId: 1,
          userId: "user-2",
          deathDate: new Date("2024-01-01"),
        }),
        user: { name: "Player Two" },
      },
    ]);
    (prisma.action.findFirst as Mock).mockResolvedValue(communicationAction());

    const response = await PATCH(
      buildRequest(),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(403);
    expect(prisma.action.update).not.toHaveBeenCalled();
  });

  it("is idempotent: does not call update when the caller's PG already read it", async () => {
    asPlayer("user-2");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        ...mockCharacter({ id: 20, campaignId: 1, userId: "user-2" }),
        user: { name: "Player Two" },
      },
    ]);
    (prisma.action.findFirst as Mock).mockResolvedValue(
      communicationAction([20])
    );

    const response = await PATCH(
      buildRequest(),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(200);
    expect(prisma.action.update).not.toHaveBeenCalled();
  });
});

// Campo libero (T-0xx): nessun `Character` destinatario, quindi nessun
// "proprietario" — è "letta" dal PRIMO master che la apre, non dal mittente
// che riapre la propria missiva inviata (vedi il commento in testa alla
// route).
describe("PATCH .../missive/[id]/read — campo libero", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const freeReceiverAction = (overrides?: {
    characterId?: number | null;
    readDate?: string | null;
  }) => ({
    id: 1,
    characterId: overrides?.characterId ?? 10,
    featureId: 5,
    creationDate: new Date("2024-06-01"),
    actionData: {
      subject: "Un avviso al taverniere",
      description: "<p>Ciao</p>",
      receiverFreeText: "Il taverniere",
      readDate: overrides?.readDate ?? null,
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
  });

  it("marks the free-receiver missive as read the first time a master opens it", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([]);
    (prisma.action.findFirst as Mock).mockResolvedValue(freeReceiverAction());

    const response = await PATCH(
      buildRequest(),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(200);
    expect(prisma.action.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        actionData: expect.objectContaining({
          receiverFreeText: "Il taverniere",
          readDate: expect.any(String),
        }),
      },
    });
  });

  it("is idempotent: a second master open does not call update again", async () => {
    asMaster();
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([]);
    (prisma.action.findFirst as Mock).mockResolvedValue(
      freeReceiverAction({ readDate: "2024-06-02T00:00:00.000Z" })
    );

    const response = await PATCH(
      buildRequest(),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(200);
    expect(prisma.action.update).not.toHaveBeenCalled();
  });

  it("does NOT mark it as read when the sender (own PG, not a master) reopens their own missive", async () => {
    // "user-1" possiede il PG 10, il mittente di `freeReceiverAction`: la
    // visibilità gli permette di vederla (l'ha mandata lui), ma riaprirla
    // non deve segnarla come letta — solo un master la marca.
    asPlayer("user-1");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        ...mockCharacter({ id: 10, campaignId: 1, userId: "user-1" }),
        user: { name: "Mario Rossi" },
      },
    ]);
    (prisma.action.findFirst as Mock).mockResolvedValue(freeReceiverAction());

    const response = await PATCH(
      buildRequest(),
      buildParams("campaign-a", "1")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.readDate).toBeNull();
    expect(prisma.action.update).not.toHaveBeenCalled();
  });
});
