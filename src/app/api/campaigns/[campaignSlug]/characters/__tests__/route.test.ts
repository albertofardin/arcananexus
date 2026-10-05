import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import {
  DataCardinality,
  DataTypeAssignability,
  DataTypeKind,
  DataVisibility,
} from "@prisma/client";
import { POST, GET } from "../route";
import {
  mockCampaign,
  mockDataType,
  mockReferenceData,
} from "@/test/helpers/prisma-fixtures";
// `vi.mock` calls below are hoisted by Vitest above all imports, so these
// imports always resolve to the mocked modules regardless of source order.
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    campaign: { findFirst: vi.fn() },
    grant: { findUnique: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    membership: { findUnique: vi.fn() },
    dataType: { findMany: vi.fn() },
    referenceData: { findUnique: vi.fn() },
    dataRequirement: { findMany: vi.fn() },
    characterData: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    xpTransaction: {
      aggregate: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    character: { create: vi.fn(), findMany: vi.fn() },
    // T-0xx, notifica "nuovo PG in review": `listGrantsForCampaign`/
    // `createNotifications` girano DENTRO la stessa transazione (vedi
    // `stubStatefulTransaction`/`stubCatalog` sotto per i default).
    notification: { createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const buildParams = (campaignSlug: string) => ({
  params: Promise.resolve({ campaignSlug }),
});

// `background` è ora obbligatorio in `createCharacterWithCatalogSchema`
// (T-0xx, validazione di form base): default iniettato qui per non dover
// aggiungerlo a ogni body letterale dei test sotto, che restano concentrati
// sul campo che stanno davvero esercitando — un test può sempre sovrascriverlo
// passandolo esplicitamente nel proprio `body`.
function buildRequest(body: unknown) {
  const payload =
    body && typeof body === "object" && !Array.isArray(body)
      ? { background: "Sfondo di test.", ...body }
      : body;
  return new NextRequest(
    "http://localhost/api/campaigns/campaign-a/characters",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

const campaignA = {
  ...mockCampaign({ id: 1, slug: "campaign-a" }),
  organization: { slug: "arcana-domine" },
};
const campaignB = {
  ...mockCampaign({ id: 2, slug: "campaign-b" }),
  organization: { slug: "arcana-domine" },
};

// --- Catalogo di campagna 1 ---
const dtRace = mockDataType({
  id: 10,
  campaignId: 1,
  kind: DataTypeKind.origins,
  cardinality: DataCardinality.single,
  assignability: DataTypeAssignability.creationOnly,
});
const dtTalent = mockDataType({
  id: 20,
  campaignId: 1,
  kind: DataTypeKind.talent,
  cardinality: DataCardinality.multi,
  assignability: DataTypeAssignability.always,
});
const dtStaffOnlyTalent = mockDataType({
  id: 21,
  campaignId: 1,
  kind: DataTypeKind.talent,
  cardinality: DataCardinality.multi,
  assignability: DataTypeAssignability.masterOnly,
});
// T-035 (round 2): categoria mai assegnabile a un PG (`cardinality: null`,
// es. "Regolamenti") — vincolo strutturale, non bypassabile nemmeno dal
// master, a differenza di `dtStaffOnlyTalent` sopra (`assignability`,
// bypassato da `isMaster`).
const dtNotAssignable = mockDataType({
  id: 22,
  campaignId: 1,
  kind: DataTypeKind.generic,
  cardinality: null,
  assignability: DataTypeAssignability.none,
});
// Campagna 2, per l'invariante cross-tenant.
const dtOtherCampaign = mockDataType({
  id: 90,
  campaignId: 2,
  kind: DataTypeKind.generic,
});

const rdElf = {
  ...mockReferenceData({ id: 100, dataTypeId: 10, flags: { startingPx: 50 } }),
  dataType: dtRace,
};
const rdDwarf = {
  ...mockReferenceData({ id: 101, dataTypeId: 10, flags: { startingPx: 30 } }),
  dataType: dtRace,
};
const rdFireTalent = {
  ...mockReferenceData({
    id: 200,
    dataTypeId: 20,
    flags: { cost: 20, repeatable: true, creationOnly: true },
  }),
  dataType: dtTalent,
};
// `creationOnly: true` (T-018): questi tre talenti verificano gate ortogonali
// (budget XP, requisiti grafo, non ripetibilità) indipendenti da
// `creationOnly` — il valore non è rilevante per quanto è sotto test qui.
// `rdNonCreationOnlyTalent` sotto copre invece esplicitamente
// `creationOnly: false`.
const rdExpensiveTalent = {
  ...mockReferenceData({
    id: 201,
    dataTypeId: 20,
    flags: { cost: 999, repeatable: true, creationOnly: true },
  }),
  dataType: dtTalent,
};
const rdRequiresMissing = {
  ...mockReferenceData({
    id: 202,
    dataTypeId: 20,
    flags: { cost: 0, repeatable: true, creationOnly: true },
  }),
  dataType: dtTalent,
};
const rdNonRepeatable = {
  ...mockReferenceData({
    id: 203,
    dataTypeId: 20,
    flags: { cost: 0, repeatable: false, creationOnly: true },
  }),
  dataType: dtTalent,
};
// T-018/T-041: rappresenta un talento come "Fendente Implacabile" nel seed —
// `creationOnly: false`, liberamente self-assegnabile sia in creazione PG sia
// via il downtime "Impara talento" (T-019/T-033), senza restrizioni
// aggiuntive per un giocatore ordinario.
const rdNonCreationOnlyTalent = {
  ...mockReferenceData({
    id: 204,
    dataTypeId: 20,
    flags: { cost: 0, repeatable: true, creationOnly: false },
  }),
  dataType: dtTalent,
};
const rdStaffOnly = {
  ...mockReferenceData({
    id: 210,
    dataTypeId: 21,
    flags: { cost: 0, repeatable: true, creationOnly: false },
  }),
  dataType: dtStaffOnlyTalent,
};
const rdNotAssignable = {
  ...mockReferenceData({ id: 220, dataTypeId: 22 }),
  dataType: dtNotAssignable,
};
const rdOtherCampaign = {
  ...mockReferenceData({ id: 900, dataTypeId: 90 }),
  dataType: dtOtherCampaign,
};

const CATALOG = [
  rdElf,
  rdDwarf,
  rdFireTalent,
  rdExpensiveTalent,
  rdRequiresMissing,
  rdNonRepeatable,
  rdNonCreationOnlyTalent,
  rdStaffOnly,
  rdNotAssignable,
  rdOtherCampaign,
];

// Tutti i `DataType` del catalogo di prova (T-0xx: usati dal guard
// `mandatory` in creazione, `listDataTypes(prisma, campaign.id)`), nessuno
// `mandatory: true` per default — i test dedicati sotto lo sovrascrivono.
const ALL_DATA_TYPES = [dtRace, dtTalent, dtStaffOnlyTalent, dtNotAssignable];

function stubCatalog() {
  (prisma.referenceData.findUnique as Mock).mockImplementation((async (args: {
    where: { id: number; dataType: { campaignId: number } };
  }) => {
    const entry = CATALOG.find(e => e.id === args.where.id);
    if (!entry) return null;
    if (entry.dataType.campaignId !== args.where.dataType.campaignId) {
      return null;
    }
    return entry;
  }) as never);
  (prisma.dataType.findMany as Mock).mockImplementation((async (args: {
    where: { campaignId: number };
  }) =>
    ALL_DATA_TYPES.filter(
      dt => dt.campaignId === args.where.campaignId
    )) as never);
  // T-0xx, fan-out notifica "nuovo PG in review": nessun master configurato
  // per default (`createNotifications` diventa un no-op, vedi il commento
  // sul mock `notification` sopra) — i test che verificano il fan-out
  // sovrascrivono con il proprio elenco di `Grant`.
  (prisma.grant.findMany as Mock).mockResolvedValue([]);
}

function asSession(userId: string, email: string) {
  (auth.api.getSession as unknown as Mock).mockResolvedValue({
    user: { id: userId, email },
  });
}

// Nessun `Grant` per l'utente sulla campagna: nè master nè staff.
function asPlainPlayer() {
  (prisma.grant.findUnique as Mock).mockResolvedValue(null);
}

function asCampaignMaster(campaignId = 1) {
  (prisma.grant.findUnique as Mock).mockImplementation((async (args: {
    where: { userId_campaignId: { userId: string; campaignId: number } };
  }) => {
    if (args.where.userId_campaignId.campaignId !== campaignId) return null;
    return {
      userId: args.where.userId_campaignId.userId,
      campaignId,
      role: "master",
    };
  }) as never);
}

// Client Prisma "stateful": tre ledger in memoria (Character, CharacterData,
// XpTransaction) letti/scritti dalle stesse implementazioni che
// `characterData.service`/`xp.service` invocano, così la richiesta HTTP
// vede davvero l'effetto cumulativo dei passi precedenti — necessario per
// verificare sia lo scenario di successo end-to-end (saldo XP finale) sia il
// rollback atomico (nessun PG/CharacterData/XpTransaction orfano dopo un
// fallimento a metà transazione).
function stubStatefulTransaction() {
  let nextCharacterId = 1;
  let nextCharacterDataId = 1;
  let nextXpId = 1;
  const characters: Record<string, unknown>[] = [];
  const characterDataRows: Record<string, unknown>[] = [];
  const xpTransactions: Record<string, unknown>[] = [];

  (prisma.character.create as Mock).mockImplementation((async (args: {
    data: Record<string, unknown>;
  }) => {
    const row = {
      id: nextCharacterId++,
      avatar: null,
      background: null,
      playerNotes: null,
      masterNotes: null,
      approvalDate: null,
      deathDate: null,
      parkDate: null,
      creationDate: new Date("2026-01-01"),
      lastUpdateDate: new Date("2026-01-01"),
      type: "pg",
      ...args.data,
      campaign: {
        name: campaignA.name,
        slug: campaignA.slug,
        organization: { slug: "arcana-domine" },
      },
      user: { name: "Test User" },
    };
    characters.push(row);
    return row;
  }) as never);

  (prisma.dataRequirement.findMany as Mock).mockResolvedValue([]);

  (prisma.characterData.findMany as Mock).mockImplementation((async (args: {
    where: { characterId: number };
  }) =>
    characterDataRows.filter(
      r => r.characterId === args.where.characterId
    )) as never);
  (prisma.characterData.findFirst as Mock).mockImplementation(
    (async (args: {
      where: { characterId: number; referenceDataId: number };
    }) =>
      characterDataRows.find(
        r =>
          r.characterId === args.where.characterId &&
          r.referenceDataId === args.where.referenceDataId
      ) ?? null) as never
  );
  // Guard di ripetibilità (`assignReferenceDataToCharacter`): conta le
  // istanze già scritte in QUESTA transazione, non solo quelle esistenti
  // prima del batch — necessario perché una creazione può assegnare lo
  // stesso `referenceDataId` più volte in sequenza (talento ripetibile).
  (prisma.characterData.count as Mock).mockImplementation(
    (async (args: {
      where: { characterId: number; referenceDataId: number };
    }) =>
      characterDataRows.filter(
        r =>
          r.characterId === args.where.characterId &&
          r.referenceDataId === args.where.referenceDataId
      ).length) as never
  );
  (prisma.characterData.deleteMany as Mock).mockImplementation((async (args: {
    where: { characterId: number; dataTypeId: number };
  }) => {
    const before = characterDataRows.length;
    for (let i = characterDataRows.length - 1; i >= 0; i--) {
      const row = characterDataRows[i];
      if (
        row.characterId === args.where.characterId &&
        row.dataTypeId === args.where.dataTypeId
      ) {
        characterDataRows.splice(i, 1);
      }
    }
    return { count: before - characterDataRows.length };
  }) as never);
  (prisma.characterData.create as Mock).mockImplementation((async (args: {
    data: Record<string, unknown>;
  }) => {
    const row = {
      id: nextCharacterDataId++,
      createdAt: new Date("2026-01-01"),
      value: null,
      userId: null,
      externalId: null,
      ...args.data,
    };
    characterDataRows.push(row);
    return row;
  }) as never);

  (prisma.xpTransaction.aggregate as Mock).mockImplementation((async (args: {
    where: { characterId: number; amount?: { gt: number } };
  }) => {
    const amountFilter = args.where.amount;
    const rows = xpTransactions.filter(
      t =>
        t.characterId === args.where.characterId &&
        (amountFilter === undefined || (t.amount as number) > amountFilter.gt)
    );
    const sum = rows.reduce((acc, t) => acc + (t.amount as number), 0);
    return { _sum: { amount: rows.length > 0 ? sum : null } };
  }) as never);
  (prisma.xpTransaction.findFirst as Mock).mockImplementation(
    (async (args: { where: { characterId: number; reason: string } }) =>
      xpTransactions.find(
        t =>
          t.characterId === args.where.characterId &&
          t.reason === args.where.reason
      ) ?? null) as never
  );
  (prisma.xpTransaction.create as Mock).mockImplementation((async (args: {
    data: Record<string, unknown>;
  }) => {
    const row = {
      id: nextXpId++,
      createdAt: new Date("2026-01-01"),
      referenceDataId: null,
      actionId: null,
      sourceCharacterId: null,
      ...args.data,
    };
    xpTransactions.push(row);
    return row;
  }) as never);

  (prisma.$transaction as Mock).mockImplementation((async (
    fn: (tx: typeof prisma) => Promise<unknown>
  ) => {
    const snapshot = {
      characters: [...characters],
      characterDataRows: [...characterDataRows],
      xpTransactions: [...xpTransactions],
    };
    // Un `Prisma.TransactionClient` reale non espone `$transaction`: lo
    // omettiamo qui così `assignReferenceDataToCharacter` (T-018) prende il
    // ramo "già in transazione" invece di aprirne una nuova.
    const { $transaction: _drop, ...tx } = prisma as unknown as Record<
      string,
      unknown
    >;
    try {
      return await fn(tx as unknown as typeof prisma);
    } catch (error) {
      characters.length = 0;
      characters.push(...snapshot.characters);
      characterDataRows.length = 0;
      characterDataRows.push(...snapshot.characterDataRows);
      xpTransactions.length = 0;
      xpTransactions.push(...snapshot.xpTransactions);
      throw error;
    }
  }) as never);

  return { characters, characterDataRows, xpTransactions };
}

describe("POST /api/campaigns/[campaignSlug]/characters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubCatalog();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const response = await POST(
      buildRequest({ name: "Aria", assignments: [] }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for a malformed body (missing name)", async () => {
    asSession("player-1", "player@example.com");

    const response = await POST(
      buildRequest({ assignments: [] }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when the same referenceDataId is selected twice with an explicit value on either occurrence (still ambiguous)", async () => {
    asSession("player-1", "player@example.com");

    const response = await POST(
      buildRequest({
        name: "Aria",
        assignments: [
          { referenceDataId: 100, value: { answer: "a" } },
          { referenceDataId: 100 },
        ],
      }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(400);
  });

  // T-0xx: un talento `repeatable` scelto più volte nella stessa richiesta di
  // creazione non è più ambiguo (nessun `value` in gioco) — ogni occorrenza è
  // un apprendimento indipendente, applicato una alla volta da
  // `assignReferenceDataToCharacter`.
  it("allows the same repeatable talent to be selected more than once in the same creation request", async () => {
    asSession("player-1", "player@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asPlainPlayer();
    const ledgers = stubStatefulTransaction();

    const response = await POST(
      buildRequest({
        name: "Aria",
        assignments: [
          { referenceDataId: rdNonCreationOnlyTalent.id },
          { referenceDataId: rdNonCreationOnlyTalent.id },
        ],
      }),
      buildParams("campaign-a")
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.assignments).toHaveLength(2);
    expect(
      ledgers.characterDataRows.filter(
        row => row.referenceDataId === rdNonCreationOnlyTalent.id
      )
    ).toHaveLength(2);
  });

  it("returns 404 when the campaign does not exist", async () => {
    asSession("player-1", "player@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(null);

    const response = await POST(
      buildRequest({ name: "Aria", assignments: [] }),
      buildParams("no-such-campaign")
    );

    expect(response.status).toBe(404);
  });

  it("returns 403 when a plain player sets a staff-only field (masterNotes) in creation", async () => {
    asSession("player-1", "player@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asPlainPlayer();

    const response = await POST(
      buildRequest({ name: "Aria", masterNotes: "segreto", assignments: [] }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(403);
  });

  it("returns 403 when a plain player tries to create a character for another user", async () => {
    asSession("player-1", "player@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asPlainPlayer();

    const response = await POST(
      buildRequest({ name: "Aria", userId: "player-2", assignments: [] }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(403);
  });

  it("returns 404 when a master creates a character for a non-existent user", async () => {
    asSession("master-1", "master@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asCampaignMaster(1);
    (prisma.user.findUnique as Mock).mockResolvedValue(null);

    const response = await POST(
      buildRequest({ name: "Aria", userId: "ghost-user", assignments: [] }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when an assignment references a catalog entry of another campaign", async () => {
    asSession("player-1", "player@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asPlainPlayer();

    const response = await POST(
      buildRequest({
        name: "Aria",
        assignments: [{ referenceDataId: rdOtherCampaign.id }],
      }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(404);
  });

  it("returns 422 when more than one race is selected", async () => {
    asSession("player-1", "player@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asPlainPlayer();

    const response = await POST(
      buildRequest({
        name: "Aria",
        assignments: [
          { referenceDataId: rdElf.id },
          { referenceDataId: rdDwarf.id },
        ],
      }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(422);
  });

  // T-0xx: una categoria identitaria `mandatory: true` (origins/assignable)
  // senza nessuna voce assegnata nel batch blocca la creazione — validazione
  // di form base, non un gate di gioco: a differenza di
  // `RequirementsNotSatisfiedError`/budget XP, non bypassabile nemmeno dal
  // master (stesso trattamento di "più di un'origine" sopra).
  it("returns 422 'Campo obbligatorio mancante' when a mandatory identity DataType has no assignment, not bypassable by the master", async () => {
    asSession("master-1", "master@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asCampaignMaster(1);
    (prisma.dataType.findMany as Mock).mockResolvedValue([
      { ...dtRace, mandatory: true },
    ]);

    const response = await POST(
      buildRequest({ name: "Aria", background: "Sfondo.", assignments: [] }),
      buildParams("campaign-a")
    );
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.error).toContain("Campo obbligatorio mancante");
  });

  it("returns 403 when a plain player self-assigns a non-playerAssignable DataType", async () => {
    asSession("player-1", "player@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asPlainPlayer();
    stubStatefulTransaction();

    const response = await POST(
      buildRequest({
        name: "Aria",
        assignments: [{ referenceDataId: rdStaffOnly.id }],
      }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(403);
  });

  // T-035 (round 2, finding minore reviewer): `cardinality: null` è un
  // vincolo strutturale (`NotAssignableDataTypeError`), non un gate di
  // permesso — mappato su 422, non 403/500, e non bypassabile nemmeno dal
  // master (a differenza di `dtStaffOnlyTalent`/`PlayerAssignmentNotAllowedError`
  // sopra, testato con 403).
  it("returns 422 (not 403/500) when a plain player tries to self-assign a DataType with cardinality: null", async () => {
    asSession("player-1", "player@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asPlainPlayer();
    stubStatefulTransaction();

    const response = await POST(
      buildRequest({
        name: "Aria",
        assignments: [{ referenceDataId: rdNotAssignable.id }],
      }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(422);
  });

  it("returns 422 even for a campaign master (cardinality: null is not bypassable)", async () => {
    asSession("master-1", "master@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asCampaignMaster(1);
    stubStatefulTransaction();

    const response = await POST(
      buildRequest({
        name: "Aria",
        assignments: [{ referenceDataId: rdNotAssignable.id }],
      }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(422);
  });

  // T-041 (correzione owner, sostituisce il test T-035 rimosso): un
  // giocatore ordinario può self-assegnarsi in creazione un talento non
  // `creationOnly` esattamente come qualunque altro talento — nessun gate
  // di approvazione dedicato. Copre anche l'escalation round 2 di T-035:
  // `Talenti` resta `playerAssignable: true` nel seed, e questo è
  // sufficiente perché il self-assign sia permesso, non un motivo di
  // rifiuto.
  it("allows a plain player to self-assign a non-creationOnly talent during character creation", async () => {
    asSession("player-1", "player@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asPlainPlayer();
    stubStatefulTransaction();

    const response = await POST(
      buildRequest({
        name: "Aria",
        assignments: [{ referenceDataId: rdNonCreationOnlyTalent.id }],
      }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(201);
  });

  it("allows a campaign master to self-assign a non-creationOnly talent directly", async () => {
    asSession("master-1", "master@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asCampaignMaster(1);
    stubStatefulTransaction();

    const response = await POST(
      buildRequest({
        name: "Aria",
        assignments: [{ referenceDataId: rdNonCreationOnlyTalent.id }],
      }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(201);
  });

  it("returns 422 when the selected talent requires a missing catalog entry", async () => {
    asSession("player-1", "player@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asPlainPlayer();
    stubStatefulTransaction();

    const requiredElsewhere = { id: 300, name: "Requisito mancante" };
    (prisma.dataRequirement.findMany as Mock).mockImplementation((async (args: {
      where: { definitionId?: number; requiredDefinitionId?: number };
    }) => {
      if (args.where.definitionId === rdRequiresMissing.id) {
        return [
          {
            id: 1,
            definitionId: rdRequiresMissing.id,
            requiredDefinitionId: requiredElsewhere.id,
            type: "requires",
            requiredDefinition: requiredElsewhere,
          },
        ];
      }
      return [];
    }) as never);

    const response = await POST(
      buildRequest({
        name: "Aria",
        assignments: [{ referenceDataId: rdRequiresMissing.id }],
      }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.details.missingRequires).toEqual([requiredElsewhere]);
  });

  it("returns 422 when the player's XP budget cannot cover the selected talent's cost", async () => {
    asSession("player-1", "player@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asPlainPlayer();
    stubStatefulTransaction();

    const response = await POST(
      buildRequest({
        name: "Aria",
        // Nessuna razza selezionata: saldo 0, il talento costa 999.
        assignments: [{ referenceDataId: rdExpensiveTalent.id }],
      }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(422);
  });

  it("returns 409 when the assignment is a non-repeatable duplicate (defensive mapping of NonRepeatableAssignmentError)", async () => {
    asSession("player-1", "player@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asPlainPlayer();
    stubStatefulTransaction();
    // Un PG appena creato non ha ancora `CharacterData`: questo simula una
    // corsa/anomalia (es. un retry) in cui l'istanza risulta già posseduta,
    // per verificare che la route mappi correttamente l'errore a 409.
    (prisma.characterData.count as Mock).mockResolvedValue(1);

    const response = await POST(
      buildRequest({
        name: "Aria",
        assignments: [{ referenceDataId: rdNonRepeatable.id }],
      }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(409);
  });

  it("creates the PG, grants the initial race XP, applies assignments, and reports the correct final XP balance (201)", async () => {
    asSession("player-1", "player@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asPlainPlayer();
    const ledgers = stubStatefulTransaction();

    const response = await POST(
      buildRequest({
        name: "Aria",
        background: "Una guerriera del nord",
        assignments: [
          { referenceDataId: rdElf.id },
          { referenceDataId: rdFireTalent.id },
        ],
      }),
      buildParams("campaign-a")
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.character.userId).toBe("player-1");
    expect(json.character.campaignId).toBe(1);
    expect(json.xpGrant.amount).toBe(50);
    expect(json.assignments).toHaveLength(2);
    // 50 (grant iniziale, unico importo positivo) accumulati; 50 - 20
    // (costo talento) = 30 disponibili.
    expect(json.xpBalance).toEqual({ earned: 50, available: 30 });
    expect(ledgers.characters).toHaveLength(1);
    expect(ledgers.characterDataRows).toHaveLength(2);
    expect(ledgers.xpTransactions).toHaveLength(2);
    // T-038: la creazione PG assegna sempre `visible` (nessuna scelta
    // esposta al giocatore in fase di creazione).
    expect(
      ledgers.characterDataRows.every(
        row => row.visibility === DataVisibility.visible
      )
    ).toBe(true);
  });

  it("notifica solo gli head_master della campagna, non master/supporter (T-0xx, nuovo PG in review)", async () => {
    asSession("player-1", "player@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asPlainPlayer();
    stubStatefulTransaction();
    (prisma.grant.findMany as Mock).mockResolvedValue([
      { userId: "head-master-1", campaignId: 1, role: "head_master" },
      { userId: "master-1", campaignId: 1, role: "master" },
      { userId: "supporter-1", campaignId: 1, role: "supporter" },
    ]);

    const response = await POST(
      buildRequest({ name: "Aria", assignments: [] }),
      buildParams("campaign-a")
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: "head-master-1",
          campaignId: 1,
          type: "character_status",
          entityId: json.character.id,
        },
      ],
    });
  });

  it("non notifica gli head_master quando il personaggio creato è un PNG", async () => {
    asSession("master-1", "master@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asCampaignMaster();
    stubStatefulTransaction();
    (prisma.grant.findMany as Mock).mockResolvedValue([
      { userId: "head-master-1", campaignId: 1, role: "head_master" },
    ]);

    const response = await POST(
      buildRequest({ name: "Guardia", type: "png", assignments: [] }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(201);
    expect(prisma.grant.findMany).not.toHaveBeenCalled();
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it("allows a campaign master to create a character for another user, overriding requirements and XP budget", async () => {
    asSession("master-1", "master@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asCampaignMaster(1);
    (prisma.user.findUnique as Mock).mockImplementation((async (args: {
      where: { id: string };
    }) => (args.where.id === "player-2" ? { id: "player-2" } : null)) as never);
    stubStatefulTransaction();

    const response = await POST(
      buildRequest({
        name: "PG del giocatore 2",
        userId: "player-2",
        // Nessuna razza: saldo 0, ma il master forza comunque l'acquisto.
        assignments: [{ referenceDataId: rdExpensiveTalent.id }],
      }),
      buildParams("campaign-a")
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.character.userId).toBe("player-2");
    expect(json.assignments[0].grantedById).toBe("master-1");
    expect(json.assignments[0].grantedByOverride).toBe(true);
    expect(json.xpBalance.available).toBe(-999);
    // T-038: la creazione PG assegna sempre `visible`, anche quando è il
    // master a crearlo per conto di un altro utente — a differenza della
    // concessione manuale post-creazione, non ha senso un'assegnazione
    // "segreta" in fase di creazione del personaggio.
    expect(json.assignments[0].visibility).toBe(DataVisibility.visible);
  });

  it("rolls back the whole request when a later assignment fails: no orphaned character/CharacterData/XpTransaction survive", async () => {
    asSession("player-1", "player@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asPlainPlayer();
    const ledgers = stubStatefulTransaction();

    const response = await POST(
      buildRequest({
        name: "Aria",
        assignments: [
          // La prima assegnazione (razza) riesce e accredita XP...
          { referenceDataId: rdElf.id },
          // ...ma la seconda (talento troppo costoso) fallisce a metà
          // transazione: l'intera richiesta deve fare rollback.
          { referenceDataId: rdExpensiveTalent.id },
        ],
      }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(422);
    expect(ledgers.characters).toHaveLength(0);
    expect(ledgers.characterDataRows).toHaveLength(0);
    expect(ledgers.xpTransactions).toHaveLength(0);
  });

  // --- QA (verifica indipendente T-018, non del dev): scenario end-to-end
  // più lungo di quello già presente sopra — qui il fallimento a metà
  // transazione è un requisito grafo non soddisfatto (non un budget XP
  // insufficiente come nel test precedente), *dopo* almeno un'assegnazione a
  // costo riuscita, per escludere che il rollback dipenda dal tipo
  // specifico di errore o dal numero di scritture già avvenute.
  it("QA: rolls back the whole request when a mid-chain assignment fails on missing requirements, after a successful costed one", async () => {
    asSession("player-1", "player@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asPlainPlayer();
    const ledgers = stubStatefulTransaction();

    const requiredElsewhere = { id: 300, name: "Requisito mancante" };
    (prisma.dataRequirement.findMany as Mock).mockImplementation((async (args: {
      where: { definitionId?: number; requiredDefinitionId?: number };
    }) => {
      if (args.where.definitionId === rdRequiresMissing.id) {
        return [
          {
            id: 1,
            definitionId: rdRequiresMissing.id,
            requiredDefinitionId: requiredElsewhere.id,
            type: "requires",
            requiredDefinition: requiredElsewhere,
          },
        ];
      }
      return [];
    }) as never);

    const response = await POST(
      buildRequest({
        name: "Aria",
        assignments: [
          // 1) razza: grant iniziale +50 XP, riesce.
          { referenceDataId: rdElf.id },
          // 2) talento a costo (20 XP), riesce: saldo residuo 30.
          { referenceDataId: rdFireTalent.id },
          // 3) fallisce per requisito grafo mancante (non per XP): rollback
          //    deve comunque annullare anche i due passi precedenti riusciti.
          { referenceDataId: rdRequiresMissing.id },
        ],
      }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.details.missingRequires).toEqual([requiredElsewhere]);
    expect(ledgers.characters).toHaveLength(0);
    expect(ledgers.characterDataRows).toHaveLength(0);
    expect(ledgers.xpTransactions).toHaveLength(0);
  });

  // T-042: riproduce ESATTAMENTE il bug segnalato dall'utente — un batch
  // selezionato in UI con una catena di requisiti a 3 livelli (Curioso →
  // Apprendista → Abile con i grimori) più una voce isolata (Addestramento
  // Fisico), inviato al server in ordine alfabetico (non topologico). Prima
  // del fix (`sortAssignmentsByRequirements`) il loop sequenziale valutava
  // "Abile con i grimori" (primo in ordine alfabetico) contro le
  // `CharacterData` già scritte nella transazione, ancora vuote: nessun
  // requisito soddisfatto → `RequirementsNotSatisfiedError` → rollback
  // dell'intera creazione PG.
  describe("T-042 — ordinamento topologico del batch di assegnazioni", () => {
    const rdCurioso = {
      ...mockReferenceData({
        id: 500,
        dataTypeId: 20,
        name: "Curioso",
        flags: { cost: 0, repeatable: true, creationOnly: true },
      }),
      dataType: dtTalent,
    };
    const rdAddestramentoFisico = {
      ...mockReferenceData({
        id: 501,
        dataTypeId: 20,
        name: "Addestramento Fisico",
        flags: { cost: 0, repeatable: true, creationOnly: true },
      }),
      dataType: dtTalent,
    };
    const rdApprendista = {
      ...mockReferenceData({
        id: 502,
        dataTypeId: 20,
        name: "Apprendista",
        flags: { cost: 0, repeatable: true, creationOnly: true },
      }),
      dataType: dtTalent,
    };
    const rdAbileConIGrimori = {
      ...mockReferenceData({
        id: 503,
        dataTypeId: 20,
        name: "Abile con i grimori",
        flags: { cost: 0, repeatable: true, creationOnly: true },
      }),
      dataType: dtTalent,
    };
    const rdCycleA = {
      ...mockReferenceData({
        id: 510,
        dataTypeId: 20,
        name: "Ciclo A",
        flags: { cost: 0, repeatable: true, creationOnly: true },
      }),
      dataType: dtTalent,
    };
    const rdCycleB = {
      ...mockReferenceData({
        id: 511,
        dataTypeId: 20,
        name: "Ciclo B",
        flags: { cost: 0, repeatable: true, creationOnly: true },
      }),
      dataType: dtTalent,
    };

    const extraCatalog = [
      rdCurioso,
      rdAddestramentoFisico,
      rdApprendista,
      rdAbileConIGrimori,
      rdCycleA,
      rdCycleB,
    ];

    function stubExtraCatalog() {
      (prisma.referenceData.findUnique as Mock).mockImplementation(
        (async (args: {
          where: { id: number; dataType: { campaignId: number } };
        }) => {
          const entry = [...CATALOG, ...extraCatalog].find(
            e => e.id === args.where.id
          );
          if (!entry) return null;
          if (entry.dataType.campaignId !== args.where.dataType.campaignId) {
            return null;
          }
          return entry;
        }) as never
      );
    }

    // `dataRequirement.findMany` è interrogata sia in forma singola
    // (`where.definitionId` o `where.requiredDefinitionId` numerici, da
    // `evaluateRequirements`/`listOutgoingRequirements` per ogni singola
    // voce durante l'assegnazione reale) sia in forma batch
    // (`where.definitionId: { in: [...] }`, dalla nuova
    // `sortAssignmentsByRequirements` prima del loop) — questo stub gestisce
    // entrambe le forme contro lo stesso grafo di edge.
    function stubRequirementGraph(
      edges: {
        id: number;
        definitionId: number;
        requiredDefinitionId: number;
        type: "requires";
        groupId?: number | null;
        requiredDefinition: { id: number; name: string };
      }[]
    ) {
      (prisma.dataRequirement.findMany as Mock).mockImplementation(
        (async (args: {
          where: {
            definitionId?: number | { in: number[] };
            requiredDefinitionId?: number;
          };
        }) => {
          if (args.where.definitionId !== undefined) {
            const definitionId = args.where.definitionId;
            if (typeof definitionId === "number") {
              return edges.filter(e => e.definitionId === definitionId);
            }
            return edges.filter(e => definitionId.in.includes(e.definitionId));
          }
          if (args.where.requiredDefinitionId !== undefined) {
            return edges.filter(
              e => e.requiredDefinitionId === args.where.requiredDefinitionId
            );
          }
          return [];
        }) as never
      );
    }

    it("succeeds and assigns all 4 talents when submitted in alphabetical (non-topological) order", async () => {
      asSession("player-1", "player@example.com");
      (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
      asPlainPlayer();
      const ledgers = stubStatefulTransaction();
      stubExtraCatalog();
      stubRequirementGraph([
        {
          id: 1,
          definitionId: rdApprendista.id,
          requiredDefinitionId: rdCurioso.id,
          type: "requires",
          requiredDefinition: rdCurioso,
        },
        {
          id: 2,
          definitionId: rdAbileConIGrimori.id,
          requiredDefinitionId: rdApprendista.id,
          type: "requires",
          requiredDefinition: rdApprendista,
        },
      ]);

      // Ordine alfabetico dei nomi (l'ordine che ha fatto fallire il
      // salvataggio dell'utente): Abile con i grimori, Addestramento
      // Fisico, Apprendista, Curioso.
      const response = await POST(
        buildRequest({
          name: "Aria",
          assignments: [
            { referenceDataId: rdAbileConIGrimori.id },
            { referenceDataId: rdAddestramentoFisico.id },
            { referenceDataId: rdApprendista.id },
            { referenceDataId: rdCurioso.id },
          ],
        }),
        buildParams("campaign-a")
      );

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.assignments).toHaveLength(4);
      const assignedIds = (json.assignments as { referenceDataId: number }[])
        .map(a => a.referenceDataId)
        .sort((a, b) => a - b);
      expect(assignedIds).toEqual(
        [
          rdCurioso.id,
          rdAddestramentoFisico.id,
          rdApprendista.id,
          rdAbileConIGrimori.id,
        ].sort((a, b) => a - b)
      );
      expect(ledgers.characterDataRows).toHaveLength(4);
    });

    it("returns 422 (not 500/timeout) for a batch with an unresolvable dependency cycle", async () => {
      asSession("player-1", "player@example.com");
      (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
      asPlainPlayer();
      const ledgers = stubStatefulTransaction();
      stubExtraCatalog();
      // Ciclo: A richiede B, B richiede A, nessuna delle due posseduta —
      // nessun ordine di assegnazione può soddisfare entrambe.
      stubRequirementGraph([
        {
          id: 1,
          definitionId: rdCycleA.id,
          requiredDefinitionId: rdCycleB.id,
          type: "requires",
          requiredDefinition: rdCycleB,
        },
        {
          id: 2,
          definitionId: rdCycleB.id,
          requiredDefinitionId: rdCycleA.id,
          type: "requires",
          requiredDefinition: rdCycleA,
        },
      ]);

      const response = await POST(
        buildRequest({
          name: "Aria",
          assignments: [
            { referenceDataId: rdCycleA.id },
            { referenceDataId: rdCycleB.id },
          ],
        }),
        buildParams("campaign-a")
      );

      expect(response.status).toBe(422);
      expect(ledgers.characters).toHaveLength(0);
      expect(ledgers.characterDataRows).toHaveLength(0);
    });
  });

  // Self-service: un giocatore senza alcun `Grant` può crearsi un PG su
  // qualunque campagna a cui accede — la creazione del PG non richiede una
  // `Membership` associativa valida (quella soglia riguarda solo
  // l'iscrizione a un evento, non ancora implementata qui).
  it("allows self-service PG creation on any campaign, without a Grant", async () => {
    asSession("player-1", "player@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignB);
    asPlainPlayer(); // nessun Grant su nessuna campagna
    stubStatefulTransaction();

    const response = await POST(
      buildRequest({ name: "Aria su campagna B", assignments: [] }),
      buildParams("campaign-b")
    );

    expect(response.status).toBe(201);
  });

  // `type` è tra i `CHARACTER_STAFF_ONLY_FIELDS`: un giocatore ordinario non
  // può auto-assegnarsi `type: "png"` in creazione, solo lo staff di
  // campagna può farlo (vedi il test "master può creare un PNG" sotto).
  it("returns 403 when a plain player sets type: 'png' in creation", async () => {
    asSession("player-1", "player@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asPlainPlayer();
    stubStatefulTransaction();

    const response = await POST(
      buildRequest({ name: "Comparsa", type: "png", assignments: [] }),
      buildParams("campaign-a")
    );

    expect(response.status).toBe(403);
    expect(prisma.character.create).not.toHaveBeenCalled();
  });

  it("allows campaign staff to create a PNG character", async () => {
    asSession("player-1", "player@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asCampaignMaster();
    stubStatefulTransaction();

    const response = await POST(
      buildRequest({ name: "Guardia", type: "png", assignments: [] }),
      buildParams("campaign-a")
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.character.type).toBe("png");
  });

  // QA (punto 3, risolto): una razza di catalogo con `flags.startingPx`
  // assente/non numerico (es. dati importati fuori dal form admin, che
  // bypassano lo Zod di `referenceDataFlags.ts`) è ora rifiutata con un 422
  // esplicito prima di aprire la transazione, invece di far propagare
  // l'`Error` generico di `grantInitialXp`/`readNumericFlag` fino al
  // catch-all 500 della route.
  it("rejects a race missing flags.startingPx with a 422, not a 500", async () => {
    asSession("player-1", "player@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    asPlainPlayer();
    stubStatefulTransaction();

    const rdRaceNoStartingPx = {
      ...mockReferenceData({ id: 105, dataTypeId: 10, flags: {} }),
      dataType: dtRace,
    };
    (prisma.referenceData.findUnique as Mock).mockImplementation((async (args: {
      where: { id: number; dataType: { campaignId: number } };
    }) => {
      if (
        args.where.id === rdRaceNoStartingPx.id &&
        args.where.dataType.campaignId === 1
      ) {
        return rdRaceNoStartingPx;
      }
      return null;
    }) as never);

    const response = await POST(
      buildRequest({
        name: "Aria",
        assignments: [{ referenceDataId: rdRaceNoStartingPx.id }],
      }),
      buildParams("campaign-a")
    );
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.error).toMatch(/origine selezionata/i);
  });

  it("does not leak a campaign A master's role onto campaign B (multi-tenant isolation)", async () => {
    asSession("master-1", "master@example.com");
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignB);
    // Il master ha un Grant solo sulla campagna 1: `asCampaignMaster(1)`
    // restituisce `null` per qualunque altra `campaignId`.
    asCampaignMaster(1);

    const response = await POST(
      buildRequest({ name: "Aria", userId: "player-2", assignments: [] }),
      buildParams("campaign-b")
    );

    // Niente Grant su campagna 2 → non è master lì, quindi non può creare
    // il PG per conto di player-2 su questa campagna.
    expect(response.status).toBe(403);
  });
});

describe("GET /api/campaigns/[campaignSlug]/characters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/characters"
    );
    const response = await GET(request, buildParams("campaign-a"));

    expect(response.status).toBe(401);
  });

  it("returns 404 when the campaign slug does not resolve", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/unknown/characters"
    );
    const response = await GET(request, buildParams("unknown"));

    expect(response.status).toBe(404);
  });

  it("returns 403 when the user is not head_master of the campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/characters"
    );
    const response = await GET(request, buildParams("campaign-a"));

    expect(response.status).toBe(403);
  });

  it("returns 200 with every character of the campaign for a head_master", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue({
      userId: "user-1",
      campaignId: 1,
      role: "head_master",
    });
    (prisma.character.findMany as Mock).mockResolvedValue([
      {
        id: 1,
        campaignId: 1,
        userId: "user-1",
        type: "pg",
        name: "Personaggio Uno",
        avatar: null,
        background: "",
        creationDate: new Date("2024-01-01"),
        approvalDate: null,
        deathDate: null,
        parkDate: null,
        playerNotes: null,
        masterNotes: null,
        lastUpdateDate: new Date("2024-01-01"),
        user: { id: "user-1", name: "Giocatore Uno", image: null },
      },
      {
        id: 2,
        campaignId: 1,
        userId: "user-2",
        type: "pg",
        name: "Personaggio Due",
        avatar: null,
        background: "",
        creationDate: new Date("2024-01-02"),
        approvalDate: null,
        deathDate: null,
        parkDate: null,
        playerNotes: null,
        masterNotes: null,
        lastUpdateDate: new Date("2024-01-02"),
        user: { id: "user-2", name: "Giocatore Due", image: "avatar.png" },
      },
    ]);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/characters"
    );
    const response = await GET(request, buildParams("campaign-a"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toHaveLength(2);
    expect(json[1]).toMatchObject({
      id: 2,
      userId: "user-2",
      name: "Personaggio Due",
      userName: "Giocatore Due",
      userImage: "avatar.png",
    });
  });

  it("scopes characters to the resolved campaign only (no cross-tenant leakage)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignA);
    (prisma.grant.findUnique as Mock).mockResolvedValue({
      userId: "user-1",
      campaignId: 1,
      role: "head_master",
    });
    (prisma.character.findMany as Mock).mockResolvedValue([]);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-a/characters"
    );
    await GET(request, buildParams("campaign-a"));

    expect(prisma.character.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { campaignId: 1 } })
    );
  });

  it("does not allow a campaign A head_master to read campaign B's characters (cross-tenant)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "u@x" },
    });
    (prisma.campaign.findFirst as Mock).mockResolvedValue(campaignB);
    (prisma.grant.findUnique as Mock).mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost/api/campaigns/campaign-b/characters"
    );
    const response = await GET(request, buildParams("campaign-b"));

    expect(response.status).toBe(403);
  });
});
