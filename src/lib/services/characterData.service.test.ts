import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DataCardinality,
  DataTypeAssignability,
  DataTypeKind,
  DataVisibility,
  Prisma,
  RequirementType,
  XpReason,
  type CharacterData,
  type PrismaClient,
  type ReferenceData,
  type XpTransaction,
} from "@prisma/client";
import {
  assignReferenceDataToCharacter,
  evaluateRequirements,
  sortAssignmentsByRequirements,
  CreationOnlyAssignmentError,
  CrossCampaignAssignmentError,
  NonRepeatableAssignmentError,
  NotAssignableDataTypeError,
  PlayerAssignmentNotAllowedError,
  RequirementBatchCycleError,
  RequirementsNotSatisfiedError,
} from "./characterData.service";
import { InsufficientXpError } from "./xp.service";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import {
  mockCharacter,
  mockCharacterData,
  mockDataType,
  mockReferenceData,
} from "@/test/helpers/prisma-fixtures";
import type { ReferenceDataWithDataType } from "@/lib/repositories/referenceData.repository";

// `$transaction` di default esegue davvero la callback passandole lo stesso
// client mockato (le funzioni scritte dentro la transazione, es.
// `createCharacterData`/`debitTalent`, accettano sia `PrismaClient` sia
// `Prisma.TransactionClient` — vedi `PrismaTransactionClient`): sufficiente per
// verificare cosa il servizio *tenta* di scrivere, senza dover simulare un
// vero motore transazionale in ogni test (eccetto quello di atomicità sotto,
// che ha bisogno di un ledger stateful per dimostrare il rollback).
function stubPassthroughTransaction() {
  prismaMock.$transaction.mockImplementation((async (
    fn: (tx: PrismaClient) => Promise<unknown>
  ) => fn(prismaClient)) as never);
}

function mockDefinition(
  overrides: {
    referenceData?: Partial<ReferenceData>;
    dataType?: Parameters<typeof mockDataType>[0];
  } = {}
): ReferenceDataWithDataType {
  return {
    ...mockReferenceData({ id: 10, dataTypeId: 3, ...overrides.referenceData }),
    dataType: mockDataType({
      id: 3,
      campaignId: 1,
      kind: DataTypeKind.talent,
      cardinality: DataCardinality.multi,
      assignability: DataTypeAssignability.always,
      ...overrides.dataType,
    }),
  };
}

// Nessun requisito nel grafo, nessun addebito XP, saldo ininfluente: la
// scorciatoia usata dai test che non riguardano `evaluateRequirements` in sé.
function stubEmptyRequirementsAndBalance() {
  prismaMock.dataRequirement.findMany.mockResolvedValue([]);
  prismaMock.characterData.findMany.mockResolvedValue([]);
  prismaMock.xpTransaction.aggregate.mockResolvedValue({
    _sum: { amount: 0 },
  } as never);
}

describe("CharacterData assignment service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("evaluateRequirements", () => {
    it("is satisfied when there is no requirement graph and no XP cost", async () => {
      stubEmptyRequirementsAndBalance();
      const definition = mockDefinition({ referenceData: { flags: null } });

      const result = await evaluateRequirements(
        prismaClient,
        { id: 1 },
        definition
      );

      expect(result).toEqual({
        missingRequires: [],
        missingRequirementGroups: [],
        blockingConflicts: [],
        xpCost: null,
        xpAvailable: 0,
        xpSufficient: true,
        satisfied: true,
      });
    });

    it("reports a missing `requires` edge the character does not own yet", async () => {
      const requiredDefinition = mockReferenceData({
        id: 20,
        name: "Fuoco minore",
      });
      prismaMock.dataRequirement.findMany.mockResolvedValue([
        {
          id: 1,
          definitionId: 10,
          requiredDefinitionId: 20,
          type: RequirementType.requires,
          requiredDefinition,
        },
      ] as never);
      prismaMock.characterData.findMany.mockResolvedValue([]);
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      } as never);
      const definition = mockDefinition();

      const result = await evaluateRequirements(
        prismaClient,
        { id: 1 },
        definition
      );

      expect(result.missingRequires).toEqual([requiredDefinition]);
      expect(result.blockingConflicts).toEqual([]);
      expect(result.satisfied).toBe(false);
    });

    it("does not report a `requires` edge the character already owns", async () => {
      const requiredDefinition = mockReferenceData({ id: 20 });
      prismaMock.dataRequirement.findMany.mockResolvedValue([
        {
          id: 1,
          definitionId: 10,
          requiredDefinitionId: 20,
          type: RequirementType.requires,
          requiredDefinition,
        },
      ] as never);
      prismaMock.characterData.findMany.mockResolvedValue([
        mockCharacterData({ characterId: 1, referenceDataId: 20 }),
      ]);
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      } as never);
      const definition = mockDefinition();

      const result = await evaluateRequirements(
        prismaClient,
        { id: 1 },
        definition
      );

      expect(result.missingRequires).toEqual([]);
      expect(result.satisfied).toBe(true);
    });

    it("reports an unsatisfied OR-group when the character owns none of its alternatives", async () => {
      const alternativeA = mockReferenceData({ id: 21, name: "Fuoco minore" });
      const alternativeB = mockReferenceData({ id: 22, name: "Gelo minore" });
      prismaMock.dataRequirement.findMany.mockResolvedValue([
        {
          id: 1,
          definitionId: 10,
          requiredDefinitionId: 21,
          type: RequirementType.requires,
          groupId: 1,
          requiredDefinition: alternativeA,
        },
        {
          id: 2,
          definitionId: 10,
          requiredDefinitionId: 22,
          type: RequirementType.requires,
          groupId: 1,
          requiredDefinition: alternativeB,
        },
      ] as never);
      prismaMock.characterData.findMany.mockResolvedValue([]);
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      } as never);
      const definition = mockDefinition();

      const result = await evaluateRequirements(
        prismaClient,
        { id: 1 },
        definition
      );

      expect(result.missingRequires).toEqual([]);
      expect(result.missingRequirementGroups).toEqual([
        [alternativeA, alternativeB],
      ]);
      expect(result.satisfied).toBe(false);
    });

    it("satisfies an OR-group when the character owns at least one of its alternatives", async () => {
      const alternativeA = mockReferenceData({ id: 21, name: "Fuoco minore" });
      const alternativeB = mockReferenceData({ id: 22, name: "Gelo minore" });
      prismaMock.dataRequirement.findMany.mockResolvedValue([
        {
          id: 1,
          definitionId: 10,
          requiredDefinitionId: 21,
          type: RequirementType.requires,
          groupId: 1,
          requiredDefinition: alternativeA,
        },
        {
          id: 2,
          definitionId: 10,
          requiredDefinitionId: 22,
          type: RequirementType.requires,
          groupId: 1,
          requiredDefinition: alternativeB,
        },
      ] as never);
      // Possiede solo l'alternativa B: basta a soddisfare l'intero gruppo.
      prismaMock.characterData.findMany.mockResolvedValue([
        mockCharacterData({ characterId: 1, referenceDataId: 22 }),
      ]);
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      } as never);
      const definition = mockDefinition();

      const result = await evaluateRequirements(
        prismaClient,
        { id: 1 },
        definition
      );

      expect(result.missingRequirementGroups).toEqual([]);
      expect(result.satisfied).toBe(true);
    });

    it("keeps an ungrouped `requires` edge mandatory (AND) alongside an unrelated OR-group", async () => {
      const mandatory = mockReferenceData({ id: 25, name: "Istruzione" });
      const alternativeA = mockReferenceData({ id: 21, name: "Fuoco minore" });
      const alternativeB = mockReferenceData({ id: 22, name: "Gelo minore" });
      prismaMock.dataRequirement.findMany.mockResolvedValue([
        {
          id: 3,
          definitionId: 10,
          requiredDefinitionId: 25,
          type: RequirementType.requires,
          groupId: null,
          requiredDefinition: mandatory,
        },
        {
          id: 1,
          definitionId: 10,
          requiredDefinitionId: 21,
          type: RequirementType.requires,
          groupId: 1,
          requiredDefinition: alternativeA,
        },
        {
          id: 2,
          definitionId: 10,
          requiredDefinitionId: 22,
          type: RequirementType.requires,
          groupId: 1,
          requiredDefinition: alternativeB,
        },
      ] as never);
      // Possiede l'alternativa A (soddisfa il gruppo OR) ma non "Istruzione"
      // (requisito individuale, ancora mancante).
      prismaMock.characterData.findMany.mockResolvedValue([
        mockCharacterData({ characterId: 1, referenceDataId: 21 }),
      ]);
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      } as never);
      const definition = mockDefinition();

      const result = await evaluateRequirements(
        prismaClient,
        { id: 1 },
        definition
      );

      expect(result.missingRequires).toEqual([mandatory]);
      expect(result.missingRequirementGroups).toEqual([]);
      expect(result.satisfied).toBe(false);
    });

    it("reports a `blocks` conflict when the character already owns the blocking definition", async () => {
      const blockingDefinition = mockReferenceData({
        id: 30,
        name: "Culto della Luce",
      });
      prismaMock.dataRequirement.findMany.mockResolvedValue([
        {
          id: 2,
          definitionId: 10,
          requiredDefinitionId: 30,
          type: RequirementType.blocks,
          requiredDefinition: blockingDefinition,
        },
      ] as never);
      prismaMock.characterData.findMany.mockResolvedValue([
        mockCharacterData({ characterId: 1, referenceDataId: 30 }),
      ]);
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      } as never);
      const definition = mockDefinition();

      const result = await evaluateRequirements(
        prismaClient,
        { id: 1 },
        definition
      );

      expect(result.blockingConflicts).toEqual([blockingDefinition]);
      expect(result.satisfied).toBe(false);
    });

    it("does not report a `blocks` conflict the character does not own", async () => {
      const blockingDefinition = mockReferenceData({ id: 30 });
      prismaMock.dataRequirement.findMany.mockResolvedValue([
        {
          id: 2,
          definitionId: 10,
          requiredDefinitionId: 30,
          type: RequirementType.blocks,
          requiredDefinition: blockingDefinition,
        },
      ] as never);
      prismaMock.characterData.findMany.mockResolvedValue([]);
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      } as never);
      const definition = mockDefinition();

      const result = await evaluateRequirements(
        prismaClient,
        { id: 1 },
        definition
      );

      expect(result.blockingConflicts).toEqual([]);
      expect(result.satisfied).toBe(true);
    });

    it("reports a `blocks` conflict via the incoming (symmetric) edge: A blocks B, character owns A, evaluating B", async () => {
      // Arco memorizzato come uscente da A (id 40) verso B (id 10, la
      // `definition` valutata qui): `definitionId: 40, requiredDefinitionId:
      // 10`. `listOutgoingRequirements(10)` non lo troverebbe (non uscente da
      // 10); solo `listIncomingRequirements(10)` lo trova, risolvendo il lato
      // sorgente (`definition` = A) anziché il lato target
      // (`requiredDefinition`).
      const blockingDefinition = mockReferenceData({
        id: 40,
        name: "Patto Oscuro",
      });
      prismaMock.dataRequirement.findMany.mockResolvedValue([
        {
          id: 5,
          definitionId: 40,
          requiredDefinitionId: 10,
          type: RequirementType.blocks,
          definition: blockingDefinition,
        },
      ] as never);
      prismaMock.characterData.findMany.mockResolvedValue([
        mockCharacterData({ characterId: 1, referenceDataId: 40 }),
      ]);
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      } as never);
      const definition = mockDefinition(); // id: 10 (= B)

      const result = await evaluateRequirements(
        prismaClient,
        { id: 1 },
        definition
      );

      expect(result.blockingConflicts).toEqual([blockingDefinition]);
      expect(result.satisfied).toBe(false);
    });

    it("is not satisfied when the XP balance is below flags.cost", async () => {
      prismaMock.dataRequirement.findMany.mockResolvedValue([]);
      prismaMock.characterData.findMany.mockResolvedValue([]);
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 10 },
      } as never);
      const definition = mockDefinition({
        referenceData: { flags: { cost: 50 } },
      });

      const result = await evaluateRequirements(
        prismaClient,
        { id: 1 },
        definition
      );

      expect(result.xpCost).toBe(50);
      expect(result.xpAvailable).toBe(10);
      expect(result.xpSufficient).toBe(false);
      expect(result.satisfied).toBe(false);
    });

    it("is satisfied when the XP balance covers flags.cost", async () => {
      prismaMock.dataRequirement.findMany.mockResolvedValue([]);
      prismaMock.characterData.findMany.mockResolvedValue([]);
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 50 },
      } as never);
      const definition = mockDefinition({
        referenceData: { flags: { cost: 50 } },
      });

      const result = await evaluateRequirements(
        prismaClient,
        { id: 1 },
        definition
      );

      expect(result.xpSufficient).toBe(true);
      expect(result.satisfied).toBe(true);
    });
  });

  // T-042: bug reale segnalato dall'utente — creando un PG selezionando
  // insieme "Curioso" (nessun requisito), "Apprendista" (richiede Curioso),
  // "Abile con i grimori" (richiede Apprendista) e "Addestramento Fisico"
  // (nessun requisito), il salvataggio falliva se il client inviava gli
  // `assignments` in un ordine non topologico (es. alfabetico): il loop di
  // `characters/route.ts` valutava ogni voce contro le `CharacterData` già
  // scritte nella stessa `tx`, non contro l'intero batch selezionato (a
  // differenza di `evaluateSelection` lato client, che valuta correttamente
  // l'insieme). Questi test coprono direttamente `sortAssignmentsByRequirements`,
  // il fix isolato dal resto del loop di assegnazione.
  describe("sortAssignmentsByRequirements", () => {
    function mockRequiresEdge(
      definitionId: number,
      requiredDefinitionId: number,
      groupId: number | null = null
    ) {
      return {
        id: definitionId * 1000 + requiredDefinitionId,
        definitionId,
        requiredDefinitionId,
        type: RequirementType.requires,
        groupId,
      };
    }

    function stubRequirementGraph(
      edges: ReturnType<typeof mockRequiresEdge>[],
      ownedReferenceDataIds: number[] = []
    ) {
      prismaMock.dataRequirement.findMany.mockResolvedValue(edges as never);
      prismaMock.characterData.findMany.mockResolvedValue(
        ownedReferenceDataIds.map(referenceDataId =>
          mockCharacterData({ characterId: 1, referenceDataId })
        )
      );
    }

    function itemFor(id: number, name: string) {
      return {
        name,
        definition: mockDefinition({ referenceData: { id, name } }),
      };
    }

    it("returns the batch unchanged (no query) when it has 0 or 1 items", async () => {
      const single = [itemFor(10, "Curioso")];

      const resultEmpty = await sortAssignmentsByRequirements(
        prismaClient,
        { id: 1 },
        []
      );
      const resultSingle = await sortAssignmentsByRequirements(
        prismaClient,
        { id: 1 },
        single
      );

      expect(resultEmpty).toEqual([]);
      expect(resultSingle).toEqual(single);
      expect(prismaMock.dataRequirement.findMany).not.toHaveBeenCalled();
      expect(prismaMock.characterData.findMany).not.toHaveBeenCalled();
    });

    // Scenario ESATTO segnalato dall'utente: 4 voci, catena a 3 livelli
    // (Curioso → Apprendista → Abile con i grimori) più una voce isolata
    // (Addestramento Fisico), inviate in ordine alfabetico — l'ordine che
    // faceva fallire il salvataggio prima del fix.
    it("reorders the exact reported scenario (Curioso→Apprendista→Abile con i grimori + Addestramento Fisico) sent alphabetically", async () => {
      const curioso = itemFor(1, "Curioso");
      const apprendista = itemFor(2, "Apprendista");
      const abileConIGrimori = itemFor(3, "Abile con i grimori");
      const addestramentoFisico = itemFor(4, "Addestramento Fisico");

      stubRequirementGraph([
        mockRequiresEdge(apprendista.definition.id, curioso.definition.id),
        mockRequiresEdge(
          abileConIGrimori.definition.id,
          apprendista.definition.id
        ),
      ]);

      // Ordine alfabetico dei nomi: Abile, Addestramento, Apprendista, Curioso.
      const alphabeticalOrder = [
        abileConIGrimori,
        addestramentoFisico,
        apprendista,
        curioso,
      ];

      const sorted = await sortAssignmentsByRequirements(
        prismaClient,
        { id: 1 },
        alphabeticalOrder
      );

      const sortedNames = sorted.map(a => a.name);
      expect(sortedNames.indexOf("Curioso")).toBeLessThan(
        sortedNames.indexOf("Apprendista")
      );
      expect(sortedNames.indexOf("Apprendista")).toBeLessThan(
        sortedNames.indexOf("Abile con i grimori")
      );
      expect(sorted).toHaveLength(4);
      expect(new Set(sorted.map(a => a.definition.id))).toEqual(
        new Set(alphabeticalOrder.map(a => a.definition.id))
      );
    });

    it("reorders a 3-level AND chain submitted in reverse order (C, A, B where A→B→C)", async () => {
      const a = itemFor(1, "A");
      const b = itemFor(2, "B");
      const c = itemFor(3, "C");
      stubRequirementGraph([
        mockRequiresEdge(a.definition.id, b.definition.id),
        mockRequiresEdge(b.definition.id, c.definition.id),
      ]);

      const sorted = await sortAssignmentsByRequirements(
        prismaClient,
        { id: 1 },
        [c, a, b]
      );

      expect(sorted.map(x => x.name)).toEqual(["C", "B", "A"]);
    });

    it("treats a requirement already owned by the character as satisfied, unblocking the dependent even without its in-batch prerequisite", async () => {
      const dependent = itemFor(1, "Dipendente");
      const missingFromBatch = itemFor(2, "Non nel batch");
      // Il PG possiede già `missingFromBatch.definition.id`: `dependent` è
      // pronto da subito, nessun riordino necessario.
      stubRequirementGraph(
        [
          mockRequiresEdge(
            dependent.definition.id,
            missingFromBatch.definition.id
          ),
        ],
        [missingFromBatch.definition.id]
      );

      const sorted = await sortAssignmentsByRequirements(
        prismaClient,
        { id: 1 },
        [dependent]
      );

      expect(sorted.map(x => x.name)).toEqual(["Dipendente"]);
    });

    it("places an item whose requirement is neither owned nor in the batch instead of falsely detecting a cycle", async () => {
      const talent = itemFor(1, "Talento orfano");
      const other = itemFor(2, "Altra voce indipendente");
      // Requisito (id 999) non fa parte del batch selezionato e non è
      // posseduto: nessun ordine potrebbe soddisfarlo, quindi non deve far
      // scattare `RequirementBatchCycleError` — l'errore reale
      // (`RequirementsNotSatisfiedError`) arriverà da
      // `assignReferenceDataToCharacter` quando la voce viene poi valutata
      // per davvero.
      stubRequirementGraph([mockRequiresEdge(talent.definition.id, 999)]);

      const sorted = await sortAssignmentsByRequirements(
        prismaClient,
        { id: 1 },
        [talent, other]
      );

      expect(sorted).toHaveLength(2);
      expect(new Set(sorted.map(x => x.name))).toEqual(
        new Set(["Talento orfano", "Altra voce indipendente"])
      );
    });

    it("resolves an OR-group by placing an already-owned or already-ordered alternative first", async () => {
      const dependent = itemFor(1, "Dipendente OR");
      const altA = itemFor(2, "Alternativa A");
      const altB = itemFor(3, "Alternativa B");
      stubRequirementGraph([
        mockRequiresEdge(dependent.definition.id, altA.definition.id, 1),
        mockRequiresEdge(dependent.definition.id, altB.definition.id, 1),
      ]);

      // Solo l'alternativa B è nel batch (in ordine "sbagliato"): il gruppo
      // OR è soddisfatto non appena B è piazzata, senza bisogno di A.
      const sorted = await sortAssignmentsByRequirements(
        prismaClient,
        { id: 1 },
        [dependent, altB]
      );

      expect(sorted.map(x => x.name)).toEqual([
        "Alternativa B",
        "Dipendente OR",
      ]);
    });

    it("preserves every occurrence of a repeated definition.id instead of collapsing them (repeatable talent picked more than once)", async () => {
      const repeated = itemFor(1, "Talento ripetibile");
      const other = itemFor(2, "Altro talento");
      stubRequirementGraph([]);

      const sorted = await sortAssignmentsByRequirements(
        prismaClient,
        { id: 1 },
        [repeated, other, repeated]
      );

      expect(sorted).toHaveLength(3);
      expect(
        sorted.filter(a => a.definition.id === repeated.definition.id)
      ).toHaveLength(2);
    });

    it("throws RequirementBatchCycleError (not an infinite loop) for a genuine in-batch cycle", async () => {
      const x = itemFor(1, "X");
      const y = itemFor(2, "Y");
      // X richiede Y e Y richiede X, nessuna delle due posseduta: nessun
      // ordine può soddisfare entrambe.
      stubRequirementGraph([
        mockRequiresEdge(x.definition.id, y.definition.id),
        mockRequiresEdge(y.definition.id, x.definition.id),
      ]);

      await expect(
        sortAssignmentsByRequirements(prismaClient, { id: 1 }, [x, y])
      ).rejects.toThrow(RequirementBatchCycleError);
    });
  });

  describe("assignReferenceDataToCharacter — invarianti e gate self-assign", () => {
    it("rejects a definition belonging to another campaign before evaluating anything else", async () => {
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition({ dataType: { campaignId: 2 } });

      await expect(
        assignReferenceDataToCharacter(prismaClient, character, definition)
      ).rejects.toBeInstanceOf(CrossCampaignAssignmentError);
      expect(prismaMock.dataRequirement.findMany).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    // T-035: `cardinality: null` è un vincolo strutturale ("questa categoria
    // non è mai assegnabile a un PG"), non un gate di permesso — deve
    // rifiutare *entrambi* i percorsi, self-assign e master, con un errore
    // esplicito (non un 500/comportamento indefinito, es. trattarla come
    // `multi` per accumulo silenzioso).
    it("rejects a self-assign when the DataType has no cardinality configured", async () => {
      stubEmptyRequirementsAndBalance();
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition({
        dataType: {
          cardinality: null,
          assignability: DataTypeAssignability.none,
        },
      });

      await expect(
        assignReferenceDataToCharacter(prismaClient, character, definition)
      ).rejects.toBeInstanceOf(NotAssignableDataTypeError);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("rejects a master grant when the DataType has no cardinality configured, even in override", async () => {
      stubEmptyRequirementsAndBalance();
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition({
        dataType: {
          cardinality: null,
          assignability: DataTypeAssignability.none,
        },
      });

      await expect(
        assignReferenceDataToCharacter(prismaClient, character, definition, {
          isMaster: true,
          grantedById: "master-1",
        })
      ).rejects.toBeInstanceOf(NotAssignableDataTypeError);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("rejects a self-assign when the DataType is not player-assignable", async () => {
      stubEmptyRequirementsAndBalance();
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition({
        dataType: { assignability: DataTypeAssignability.masterOnly },
      });

      await expect(
        assignReferenceDataToCharacter(prismaClient, character, definition)
      ).rejects.toBeInstanceOf(PlayerAssignmentNotAllowedError);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("rejects a self-assign of a creationOnly entry outside character creation", async () => {
      stubEmptyRequirementsAndBalance();
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition({
        referenceData: { flags: { creationOnly: true } },
      });

      await expect(
        assignReferenceDataToCharacter(prismaClient, character, definition, {
          isCreation: false,
        })
      ).rejects.toBeInstanceOf(CreationOnlyAssignmentError);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("allows a self-assign of a creationOnly entry during character creation", async () => {
      stubEmptyRequirementsAndBalance();
      stubPassthroughTransaction();
      prismaMock.characterData.create.mockResolvedValue(
        mockCharacterData({
          characterId: 1,
          referenceDataId: 10,
          dataTypeId: 3,
        })
      );
      const character = mockCharacter({ id: 1, campaignId: 1 });
      // Rappresenta "Lama del Veterano" nel seed: unico talento con
      // `creationOnly: true`, quindi l'unico self-assegnabile in creazione PG
      // (T-035, round 3).
      const definition = mockDefinition({
        referenceData: { flags: { creationOnly: true } },
      });

      const result = await assignReferenceDataToCharacter(
        prismaClient,
        character,
        definition,
        { isCreation: true }
      );

      expect(result.characterData.referenceDataId).toBe(10);
    });

    // T-041 (correzione owner): un talento (`kind: talent`) che *non*
    // dichiara `flags.creationOnly = true` resta liberamente
    // self-assegnabile in creazione PG, esattamente come qualunque altra
    // categoria (razza/religione/…) — soggetto solo alla valutazione
    // standard di requisiti/XP, invariata. T-035 aveva introdotto qui un
    // gate dedicato (`TalentApprovalRequiredError`) partendo dall'assunzione
    // opposta e sbagliata; rimosso in T-041, vedi `## Note / Log` del task
    // file per il chiarimento raccolto dall'owner.
    it("allows a self-assign of a non-creationOnly talent during character creation", async () => {
      stubEmptyRequirementsAndBalance();
      stubPassthroughTransaction();
      prismaMock.characterData.create.mockResolvedValue(
        mockCharacterData({
          characterId: 1,
          referenceDataId: 10,
          dataTypeId: 3,
        })
      );
      const character = mockCharacter({ id: 1, campaignId: 1 });
      // Rappresenta un talento come "Fendente Implacabile" nel seed:
      // `creationOnly: false`, comunque scegliibile in creazione PG.
      const definition = mockDefinition({
        referenceData: { flags: { creationOnly: false } },
      });

      const result = await assignReferenceDataToCharacter(
        prismaClient,
        character,
        definition,
        { isCreation: true }
      );

      expect(result.characterData.referenceDataId).toBe(10);
    });

    it("allows a self-assign of a talent with no creationOnly flag at all during character creation", async () => {
      stubEmptyRequirementsAndBalance();
      stubPassthroughTransaction();
      prismaMock.characterData.create.mockResolvedValue(
        mockCharacterData({
          characterId: 1,
          referenceDataId: 10,
          dataTypeId: 3,
        })
      );
      const character = mockCharacter({ id: 1, campaignId: 1 });
      // `flags` senza `creationOnly` (assente, non solo `false` esplicito):
      // stesso esito, nessun default applicativo lo rende un rifiuto.
      const definition = mockDefinition({ referenceData: { flags: {} } });

      const result = await assignReferenceDataToCharacter(
        prismaClient,
        character,
        definition,
        { isCreation: true }
      );

      expect(result.characterData.referenceDataId).toBe(10);
    });

    // Il percorso `talents` (T-019, via `talents.ts`) non
    // passa mai `isCreation` (sempre `false` di default) — un talento non
    // `creationOnly` resta self-assegnabile anche lì, stesso esito della
    // creazione PG (nessuna restrizione aggiuntiva su nessuno dei due
    // percorsi).
    it("still allows self-assign of a non-creationOnly talent outside character creation (talents path)", async () => {
      stubEmptyRequirementsAndBalance();
      stubPassthroughTransaction();
      const created = mockCharacterData({
        characterId: 1,
        referenceDataId: 10,
        dataTypeId: 3,
      });
      prismaMock.characterData.create.mockResolvedValue(created);
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition({
        referenceData: { flags: { creationOnly: false } },
      });

      // Nessun `isCreation` passato, stessa firma usata da
      // `talents.ts` → `assignReferenceDataToCharacter(tx, character,
      // definition, { actionId })`.
      const result = await assignReferenceDataToCharacter(
        prismaClient,
        character,
        definition
      );

      expect(result.characterData).toEqual(created);
    });

    it("rejects a self-assign when evaluateRequirements is not satisfied, exposing the evaluation on the error", async () => {
      const requiredDefinition = mockReferenceData({ id: 20 });
      prismaMock.dataRequirement.findMany.mockResolvedValue([
        {
          id: 1,
          definitionId: 10,
          requiredDefinitionId: 20,
          type: RequirementType.requires,
          requiredDefinition,
        },
      ] as never);
      prismaMock.characterData.findMany.mockResolvedValue([]);
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      } as never);
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition();

      const error = await assignReferenceDataToCharacter(
        prismaClient,
        character,
        definition
      ).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(RequirementsNotSatisfiedError);
      expect(
        (error as RequirementsNotSatisfiedError).evaluation.missingRequires
      ).toEqual([requiredDefinition]);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("rejects a self-assign of B when the character owns A and A blocks B via an incoming edge (mutua esclusione simmetrica)", async () => {
      const blockingDefinition = mockReferenceData({ id: 40 });
      prismaMock.dataRequirement.findMany.mockResolvedValue([
        {
          id: 5,
          definitionId: 40,
          requiredDefinitionId: 10,
          type: RequirementType.blocks,
          definition: blockingDefinition,
        },
      ] as never);
      prismaMock.characterData.findMany.mockResolvedValue([
        mockCharacterData({ characterId: 1, referenceDataId: 40 }),
      ]);
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      } as never);
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition(); // id: 10 (= B)

      const error = await assignReferenceDataToCharacter(
        prismaClient,
        character,
        definition
      ).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(RequirementsNotSatisfiedError);
      expect(
        (error as RequirementsNotSatisfiedError).evaluation.blockingConflicts
      ).toEqual([blockingDefinition]);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("allows a self-assign when assignability, requirements and XP are all satisfied", async () => {
      stubEmptyRequirementsAndBalance();
      stubPassthroughTransaction();
      const created = mockCharacterData({
        characterId: 1,
        referenceDataId: 10,
        dataTypeId: 3,
        grantedById: null,
        grantedByOverride: false,
      });
      prismaMock.characterData.create.mockResolvedValue(created);
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition();

      const result = await assignReferenceDataToCharacter(
        prismaClient,
        character,
        definition
      );

      expect(result).toEqual({ characterData: created, xpTransaction: null });
      expect(prismaMock.characterData.create).toHaveBeenCalledWith({
        data: {
          characterId: 1,
          referenceDataId: 10,
          dataTypeId: 3,
          value: Prisma.JsonNull,
          // T-038: il self-assign assegna sempre `visible`, non negoziabile.
          visibility: DataVisibility.visible,
          grantedById: null,
          grantedByOverride: false,
          actionId: null,
        },
      });
      // Nessun `flags.cost`: nessun addebito XP.
      expect(prismaMock.xpTransaction.create).not.toHaveBeenCalled();
    });

    it("debits the XP cost inside the same transaction as the assignment", async () => {
      prismaMock.dataRequirement.findMany.mockResolvedValue([]);
      prismaMock.characterData.findMany.mockResolvedValue([]);
      // Il saldo è interrogato due volte: dal pre-check (`evaluateRequirements`)
      // e di nuovo da `debitTalent` dentro la transazione (nessuna deroga).
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 20 },
      } as never);
      stubPassthroughTransaction();
      const created = mockCharacterData({
        characterId: 1,
        referenceDataId: 10,
        dataTypeId: 3,
      });
      prismaMock.characterData.create.mockResolvedValue(created);
      const debit = { id: 1, characterId: 1, amount: -12 } as XpTransaction;
      prismaMock.xpTransaction.create.mockResolvedValue(debit as never);
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition({
        referenceData: { flags: { cost: 12 } },
      });

      const result = await assignReferenceDataToCharacter(
        prismaClient,
        character,
        definition
      );

      expect(result.xpTransaction).toEqual(debit);
      expect(prismaMock.xpTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ characterId: 1, amount: -12 }),
      });
    });
  });

  describe("assignReferenceDataToCharacter — concessione master (override)", () => {
    it("requires grantedById when isMaster is true", async () => {
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition();

      await expect(
        assignReferenceDataToCharacter(prismaClient, character, definition, {
          isMaster: true,
        })
      ).rejects.toThrow(/grantedById/);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("grants even when the DataType is not player-assignable, requirements are missing, and outside creationOnly, marking grantedByOverride", async () => {
      const requiredDefinition = mockReferenceData({ id: 20 });
      prismaMock.dataRequirement.findMany.mockResolvedValue([
        {
          id: 1,
          definitionId: 10,
          requiredDefinitionId: 20,
          type: RequirementType.requires,
          requiredDefinition,
        },
      ] as never);
      prismaMock.characterData.findMany.mockResolvedValue([]);
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      } as never);
      stubPassthroughTransaction();
      const created = mockCharacterData({
        characterId: 1,
        referenceDataId: 10,
        dataTypeId: 3,
        grantedById: "master-1",
        grantedByOverride: true,
      });
      prismaMock.characterData.create.mockResolvedValue(created);
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition({
        referenceData: { flags: { creationOnly: true } },
        dataType: { assignability: DataTypeAssignability.masterOnly },
      });

      const result = await assignReferenceDataToCharacter(
        prismaClient,
        character,
        definition,
        { isMaster: true, grantedById: "master-1", isCreation: false }
      );

      expect(result.characterData).toEqual(created);
      expect(prismaMock.characterData.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          grantedById: "master-1",
          grantedByOverride: true,
        }),
      });
    });

    it("does not mark grantedByOverride when the master grants an entry whose requirements were already satisfied", async () => {
      stubEmptyRequirementsAndBalance();
      stubPassthroughTransaction();
      const created = mockCharacterData({
        characterId: 1,
        referenceDataId: 10,
        dataTypeId: 3,
        grantedById: "master-1",
        grantedByOverride: false,
      });
      prismaMock.characterData.create.mockResolvedValue(created);
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition();

      await assignReferenceDataToCharacter(
        prismaClient,
        character,
        definition,
        {
          isMaster: true,
          grantedById: "master-1",
        }
      );

      expect(prismaMock.characterData.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ grantedByOverride: false }),
      });
    });

    it("forces the XP debit past an insufficient balance for a master grant", async () => {
      prismaMock.dataRequirement.findMany.mockResolvedValue([]);
      prismaMock.characterData.findMany.mockResolvedValue([]);
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      } as never);
      stubPassthroughTransaction();
      prismaMock.characterData.create.mockResolvedValue(
        mockCharacterData({
          characterId: 1,
          referenceDataId: 10,
          dataTypeId: 3,
        })
      );
      const debit = { id: 1, characterId: 1, amount: -50 } as XpTransaction;
      prismaMock.xpTransaction.create.mockResolvedValue(debit as never);
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition({
        referenceData: { flags: { cost: 50 } },
      });

      const result = await assignReferenceDataToCharacter(
        prismaClient,
        character,
        definition,
        { isMaster: true, grantedById: "master-1" }
      );

      expect(result.xpTransaction).toEqual(debit);
      // Con l'override il saldo non viene nemmeno riconsultato dentro la tx
      // (solo il pre-check di `evaluateRequirements` lo interroga — una
      // chiamata a `getXpBalance`, che interroga `aggregate` due volte:
      // XP guadagnati + saldo netto disponibile).
      expect(prismaMock.xpTransaction.aggregate).toHaveBeenCalledTimes(2);
    });

    it("records a zero-cost XP transaction with a note for a master grant with freeOfCharge, instead of debiting flags.cost", async () => {
      stubEmptyRequirementsAndBalance();
      stubPassthroughTransaction();
      prismaMock.characterData.create.mockResolvedValue(
        mockCharacterData({
          characterId: 1,
          referenceDataId: 10,
          dataTypeId: 3,
        })
      );
      const grant = {
        id: 1,
        characterId: 1,
        amount: 0,
        note: "Concesso dal master",
      } as unknown as XpTransaction;
      prismaMock.xpTransaction.create.mockResolvedValue(grant);
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition({
        referenceData: { flags: { cost: 50 } },
      });

      const result = await assignReferenceDataToCharacter(
        prismaClient,
        character,
        definition,
        { isMaster: true, grantedById: "master-1", freeOfCharge: true }
      );

      expect(result.xpTransaction).toEqual(grant);
      expect(prismaMock.xpTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          amount: 0,
          note: "Concesso dal master",
        }),
      });
    });
  });

  // T-050: cascata `grants` — ottenere una voce di origine assegna
  // automaticamente e ricorsivamente anche le voci bersaglio dei suoi archi
  // `grants`, sempre gratis. Helper dedicato: a differenza di
  // `stubEmptyRequirementsAndBalance` (un solo `mockResolvedValue` piatto),
  // qui serve un grafo diverso per `definitionId` diversi (l'origine e il
  // bersaglio hanno ciascuno i propri archi uscenti), quindi si ispeziona il
  // `where` ricevuto — stesso pattern di `mockReferenceDataFindMany` in
  // `characterTalents.service.test.ts`.
  function mockRequirementGraphByDefinitionId(
    edgesByDefinitionId: Record<number, unknown[]>
  ) {
    prismaMock.dataRequirement.findMany.mockImplementation((args => {
      const where = (args as { where?: Record<string, unknown> })?.where ?? {};
      if ("definitionId" in where) {
        return Promise.resolve(
          edgesByDefinitionId[where.definitionId as number] ?? []
        );
      }
      return Promise.resolve([]); // archi entranti: irrilevanti per `grants`
    }) as never);
  }

  describe("assignReferenceDataToCharacter — cascata grants (T-050)", () => {
    it("assegna automaticamente e gratuitamente la voce bersaglio di un arco grants", async () => {
      const target = mockDefinition({
        referenceData: {
          id: 20,
          dataTypeId: 4,
          name: "Bersaglio",
          flags: { cost: 50 },
        },
        dataType: { id: 4 },
      });
      mockRequirementGraphByDefinitionId({
        10: [
          {
            id: 1,
            definitionId: 10,
            requiredDefinitionId: 20,
            type: RequirementType.grants,
            groupId: null,
            requiredDefinition: target,
          },
        ],
        20: [],
      });
      prismaMock.characterData.findMany.mockResolvedValue([]);
      prismaMock.characterData.count.mockResolvedValue(0); // il bersaglio non è già posseduto
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      } as never);
      stubPassthroughTransaction();
      const originCreated = mockCharacterData({
        id: 100,
        characterId: 1,
        referenceDataId: 10,
        dataTypeId: 3,
      });
      const targetCreated = mockCharacterData({
        id: 101,
        characterId: 1,
        referenceDataId: 20,
        dataTypeId: 4,
      });
      prismaMock.characterData.create
        .mockResolvedValueOnce(originCreated)
        .mockResolvedValueOnce(targetCreated);
      const freeGrant = {
        id: 1,
        characterId: 1,
        amount: 0,
        note: "Concesso dal master",
      } as unknown as XpTransaction;
      prismaMock.xpTransaction.create.mockResolvedValue(freeGrant);
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const origin = mockDefinition();

      const result = await assignReferenceDataToCharacter(
        prismaClient,
        character,
        origin
      );

      expect(result.characterData).toEqual(originCreated);
      expect(prismaMock.characterData.create).toHaveBeenCalledTimes(2);
      expect(prismaMock.characterData.create).toHaveBeenNthCalledWith(2, {
        data: expect.objectContaining({
          referenceDataId: 20,
          dataTypeId: 4,
          grantedById: null,
          grantedByOverride: false,
        }),
      });
      // `flags.cost: 50` del bersaglio è bypassato (gratis): addebito a 0.
      expect(prismaMock.xpTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ amount: 0 }),
      });
    });

    it("non riassegna la voce bersaglio se il personaggio la possiede già", async () => {
      const target = mockDefinition({
        referenceData: { id: 20, dataTypeId: 4, name: "Bersaglio" },
        dataType: { id: 4 },
      });
      mockRequirementGraphByDefinitionId({
        10: [
          {
            id: 1,
            definitionId: 10,
            requiredDefinitionId: 20,
            type: RequirementType.grants,
            groupId: null,
            requiredDefinition: target,
          },
        ],
      });
      prismaMock.characterData.findMany.mockResolvedValue([]);
      prismaMock.characterData.count.mockResolvedValue(1); // già posseduto
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      } as never);
      stubPassthroughTransaction();
      prismaMock.characterData.create.mockResolvedValue(
        mockCharacterData({
          characterId: 1,
          referenceDataId: 10,
          dataTypeId: 3,
        })
      );
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const origin = mockDefinition();

      await assignReferenceDataToCharacter(prismaClient, character, origin);

      // Solo l'origine è stata creata, il bersaglio già posseduto no.
      expect(prismaMock.characterData.create).toHaveBeenCalledTimes(1);
    });

    it("rileva e salta (senza crash) un ciclo grants A -> B -> A a runtime, difesa in profondità", async () => {
      const originId = 10;
      const targetId = 20;
      const targetDefinition = mockDefinition({
        referenceData: { id: targetId, dataTypeId: 4, name: "Bersaglio" },
        dataType: { id: 4 },
      });
      const originDefinitionRef = mockDefinition({
        referenceData: { id: originId, dataTypeId: 3, name: "Origine" },
        dataType: { id: 3 },
      });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockRequirementGraphByDefinitionId({
        [originId]: [
          {
            id: 1,
            definitionId: originId,
            requiredDefinitionId: targetId,
            type: RequirementType.grants,
            groupId: null,
            requiredDefinition: targetDefinition,
          },
        ],
        [targetId]: [
          {
            id: 2,
            definitionId: targetId,
            requiredDefinitionId: originId,
            type: RequirementType.grants,
            groupId: null,
            requiredDefinition: originDefinitionRef,
          },
        ],
      });
      prismaMock.characterData.findMany.mockResolvedValue([]);
      prismaMock.characterData.count.mockResolvedValue(0); // nessuno dei due è già posseduto
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      } as never);
      stubPassthroughTransaction();
      prismaMock.characterData.create
        .mockResolvedValueOnce(
          mockCharacterData({
            characterId: 1,
            referenceDataId: originId,
            dataTypeId: 3,
          })
        )
        .mockResolvedValueOnce(
          mockCharacterData({
            characterId: 1,
            referenceDataId: targetId,
            dataTypeId: 4,
          })
        );
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const origin = mockDefinition();

      await expect(
        assignReferenceDataToCharacter(prismaClient, character, origin)
      ).resolves.toBeDefined();

      // Origine + bersaglio create una volta ciascuno; il ciclo di ritorno
      // (bersaglio -> origine) è stato rilevato e saltato, non ha innescato
      // una terza `create` né lanciato un'eccezione.
      expect(prismaMock.characterData.create).toHaveBeenCalledTimes(2);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Ciclo 'grants' rilevato e ignorato")
      );

      errorSpy.mockRestore();
    });
  });

  // T-038: nessun percorso di scrittura impostava mai `visibility` prima di
  // questo task (sempre `hidden`, default Prisma) — questi test fissano la
  // decisione di design presa con l'utente (task file, `## Note / Log`).
  // Round T-0xx: il default per le concessioni master non è più `hidden`
  // fisso via codice, ma `DataType.visibility` (configurabile per
  // categoria) — vedi i due test "senza scelta esplicita" sotto.
  describe("assignReferenceDataToCharacter — visibilità (T-038)", () => {
    it("self-assign: assegna sempre visible, anche se (erroneamente) venisse passato un `visibility` esplicito", async () => {
      stubEmptyRequirementsAndBalance();
      stubPassthroughTransaction();
      prismaMock.characterData.create.mockResolvedValue(
        mockCharacterData({ characterId: 1, referenceDataId: 10 })
      );
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition();

      await assignReferenceDataToCharacter(
        prismaClient,
        character,
        definition,
        {
          visibility: DataVisibility.hidden,
        }
      );

      expect(prismaMock.characterData.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ visibility: DataVisibility.visible }),
      });
    });

    it("concessione master senza scelta esplicita: eredita DataType.visibility = visible", async () => {
      stubEmptyRequirementsAndBalance();
      stubPassthroughTransaction();
      prismaMock.characterData.create.mockResolvedValue(
        mockCharacterData({ characterId: 1, referenceDataId: 10 })
      );
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition({
        dataType: { visibility: DataVisibility.visible },
      });

      await assignReferenceDataToCharacter(
        prismaClient,
        character,
        definition,
        {
          isMaster: true,
          grantedById: "master-1",
        }
      );

      expect(prismaMock.characterData.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ visibility: DataVisibility.visible }),
      });
    });

    it("concessione master senza scelta esplicita: eredita DataType.visibility = hidden", async () => {
      stubEmptyRequirementsAndBalance();
      stubPassthroughTransaction();
      prismaMock.characterData.create.mockResolvedValue(
        mockCharacterData({ characterId: 1, referenceDataId: 10 })
      );
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition({
        dataType: { visibility: DataVisibility.hidden },
      });

      await assignReferenceDataToCharacter(
        prismaClient,
        character,
        definition,
        {
          isMaster: true,
          grantedById: "master-1",
        }
      );

      expect(prismaMock.characterData.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ visibility: DataVisibility.hidden }),
      });
    });

    it("concessione master con scelta esplicita: rispetta visible anche se DataType.visibility = hidden", async () => {
      stubEmptyRequirementsAndBalance();
      stubPassthroughTransaction();
      prismaMock.characterData.create.mockResolvedValue(
        mockCharacterData({ characterId: 1, referenceDataId: 10 })
      );
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition({
        dataType: { visibility: DataVisibility.hidden },
      });

      await assignReferenceDataToCharacter(
        prismaClient,
        character,
        definition,
        {
          isMaster: true,
          grantedById: "master-1",
          visibility: DataVisibility.visible,
        }
      );

      expect(prismaMock.characterData.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ visibility: DataVisibility.visible }),
      });
    });
  });

  describe("assignReferenceDataToCharacter — cardinalità e ripetibilità", () => {
    it("replaces the existing assignment for a single-cardinality DataType", async () => {
      stubEmptyRequirementsAndBalance();
      stubPassthroughTransaction();
      prismaMock.characterData.deleteMany.mockResolvedValue({ count: 1 });
      const created = mockCharacterData({
        characterId: 1,
        referenceDataId: 11,
        dataTypeId: 3,
      });
      prismaMock.characterData.create.mockResolvedValue(created);
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition({
        referenceData: { id: 11 },
        dataType: { cardinality: DataCardinality.single },
      });

      await assignReferenceDataToCharacter(prismaClient, character, definition);

      expect(prismaMock.characterData.deleteMany).toHaveBeenCalledWith({
        where: { characterId: 1, dataTypeId: 3 },
      });
      // `deleteMany` precede `create` (sostituzione, non accumulo).
      expect(
        prismaMock.characterData.deleteMany.mock.invocationCallOrder[0]
      ).toBeLessThan(
        prismaMock.characterData.create.mock.invocationCallOrder[0]
      );
    });

    it("accumulates for a multi-cardinality DataType without deleting anything", async () => {
      stubEmptyRequirementsAndBalance();
      stubPassthroughTransaction();
      prismaMock.characterData.create.mockResolvedValue(
        mockCharacterData({
          characterId: 1,
          referenceDataId: 10,
          dataTypeId: 3,
        })
      );
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition();

      await assignReferenceDataToCharacter(prismaClient, character, definition);

      expect(prismaMock.characterData.deleteMany).not.toHaveBeenCalled();
    });

    it("rejects a duplicate of a non-repeatable multi-cardinality definition the character already owns", async () => {
      stubEmptyRequirementsAndBalance();
      stubPassthroughTransaction();
      prismaMock.characterData.count.mockResolvedValue(1);
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition({
        referenceData: { flags: { repeatable: false } },
      });

      await expect(
        assignReferenceDataToCharacter(prismaClient, character, definition)
      ).rejects.toBeInstanceOf(NonRepeatableAssignmentError);
      expect(prismaMock.characterData.create).not.toHaveBeenCalled();
    });

    it("allows a repeated assignment of the same definition when repeatable is not false", async () => {
      stubEmptyRequirementsAndBalance();
      stubPassthroughTransaction();
      prismaMock.characterData.count.mockResolvedValue(1);
      prismaMock.characterData.create.mockResolvedValue(
        mockCharacterData({
          characterId: 1,
          referenceDataId: 10,
          dataTypeId: 3,
        })
      );
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition();

      await expect(
        assignReferenceDataToCharacter(prismaClient, character, definition)
      ).resolves.toBeDefined();
      expect(prismaMock.characterData.create).toHaveBeenCalled();
    });

    it("enforces repeatable = false even for a master override grant", async () => {
      stubEmptyRequirementsAndBalance();
      stubPassthroughTransaction();
      prismaMock.characterData.count.mockResolvedValue(1);
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition({
        referenceData: { flags: { repeatable: false } },
      });

      await expect(
        assignReferenceDataToCharacter(prismaClient, character, definition, {
          isMaster: true,
          grantedById: "master-1",
        })
      ).rejects.toBeInstanceOf(NonRepeatableAssignmentError);
    });

    it("rejects a repeatable definition once the character has reached flags.maxRepetitions", async () => {
      stubEmptyRequirementsAndBalance();
      stubPassthroughTransaction();
      prismaMock.characterData.count.mockResolvedValue(2);
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition({
        referenceData: { flags: { repeatable: true, maxRepetitions: 2 } },
      });

      await expect(
        assignReferenceDataToCharacter(prismaClient, character, definition)
      ).rejects.toBeInstanceOf(NonRepeatableAssignmentError);
      expect(prismaMock.characterData.create).not.toHaveBeenCalled();
    });

    it("allows a repeatable definition below flags.maxRepetitions", async () => {
      stubEmptyRequirementsAndBalance();
      stubPassthroughTransaction();
      prismaMock.characterData.count.mockResolvedValue(1);
      prismaMock.characterData.create.mockResolvedValue(
        mockCharacterData({
          characterId: 1,
          referenceDataId: 10,
          dataTypeId: 3,
        })
      );
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition({
        referenceData: { flags: { repeatable: true, maxRepetitions: 2 } },
      });

      await expect(
        assignReferenceDataToCharacter(prismaClient, character, definition)
      ).resolves.toBeDefined();
      expect(prismaMock.characterData.create).toHaveBeenCalled();
    });
  });

  describe("assignReferenceDataToCharacter — bonus punti missiva/downtime (T-0xx)", () => {
    it("grants +1 downtime point and +1 personal bonus cap when the talent has isDowntimePointBonus", async () => {
      stubEmptyRequirementsAndBalance();
      stubPassthroughTransaction();
      prismaMock.characterData.create.mockResolvedValue(
        mockCharacterData({
          characterId: 1,
          referenceDataId: 10,
          dataTypeId: 3,
        })
      );
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition({
        referenceData: { flags: { isDowntimePointBonus: true } },
      });

      await assignReferenceDataToCharacter(prismaClient, character, definition);

      expect(prismaMock.character.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          downtimePoints: { increment: 1 },
          downtimePointsBonus: { increment: 1 },
        },
      });
    });

    it("grants +1 missive point and +1 personal bonus cap when the talent has isMissivePointBonus", async () => {
      stubEmptyRequirementsAndBalance();
      stubPassthroughTransaction();
      prismaMock.characterData.create.mockResolvedValue(
        mockCharacterData({
          characterId: 1,
          referenceDataId: 10,
          dataTypeId: 3,
        })
      );
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition({
        referenceData: { flags: { isMissivePointBonus: true } },
      });

      await assignReferenceDataToCharacter(prismaClient, character, definition);

      expect(prismaMock.character.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          missivePoints: { increment: 1 },
          missivePointsBonus: { increment: 1 },
        },
      });
    });

    it("does not touch missive/downtime counters for a talent without the point-bonus flags", async () => {
      stubEmptyRequirementsAndBalance();
      stubPassthroughTransaction();
      prismaMock.characterData.create.mockResolvedValue(
        mockCharacterData({
          characterId: 1,
          referenceDataId: 10,
          dataTypeId: 3,
        })
      );
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition({
        referenceData: { flags: { creationOnly: false } },
      });

      await assignReferenceDataToCharacter(prismaClient, character, definition);

      expect(prismaMock.character.update).not.toHaveBeenCalled();
    });
  });

  describe("assignReferenceDataToCharacter — atomicità", () => {
    // Ledger stateful (stesso pattern del test end-to-end di
    // `xp.service.test.ts`): dimostra che se l'addebito XP fallisce dentro la
    // transazione, la `CharacterData` creata poco prima non resta persistita
    // — non basta osservare che `create` è stato chiamato, va dimostrato che
    // l'effetto non sopravvive al rollback.
    it("rolls back the CharacterData creation when the XP debit fails inside the transaction", async () => {
      const characterDataLedger: CharacterData[] = [];
      let nextId = 100;

      prismaMock.$transaction.mockImplementation((async (
        fn: (tx: PrismaClient) => Promise<unknown>
      ) => {
        const snapshot = [...characterDataLedger];
        try {
          return await fn(prismaClient);
        } catch (error) {
          characterDataLedger.length = 0;
          characterDataLedger.push(...snapshot);
          throw error;
        }
      }) as never);

      prismaMock.characterData.create.mockImplementation((async (args: {
        data: Omit<CharacterData, "id" | "createdAt">;
      }) => {
        const row = mockCharacterData({ id: nextId++, ...args.data });
        characterDataLedger.push(row);
        return row;
      }) as never);

      // Pre-check (`evaluateRequirements`, fuori transazione): saldo
      // sufficiente, l'assegnazione self-assign passa il gate.
      prismaMock.dataRequirement.findMany.mockResolvedValue([]);
      prismaMock.characterData.findMany.mockResolvedValue([]);
      // `getXpBalance` interroga `aggregate` due volte per chiamata (XP
      // guadagnati + saldo netto disponibile, via `Promise.all`): ogni
      // "chiamata logica" sotto occupa quindi due `mockResolvedValueOnce`.
      prismaMock.xpTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 20 } } as never)
        .mockResolvedValueOnce({ _sum: { amount: 20 } } as never)
        // Ricontrollo di `debitTalent` dentro la transazione: il saldo è
        // "cambiato" (TOCTOU) e non copre più il costo — l'addebito fallisce.
        .mockResolvedValueOnce({ _sum: { amount: 2 } } as never)
        .mockResolvedValueOnce({ _sum: { amount: 2 } } as never);

      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition({
        referenceData: { flags: { cost: 12 } },
      });

      await expect(
        assignReferenceDataToCharacter(prismaClient, character, definition)
      ).rejects.toBeInstanceOf(InsufficientXpError);

      // Il `create` è stato tentato (era il primo passo della transazione)...
      expect(prismaMock.characterData.create).toHaveBeenCalledTimes(1);
      // ...ma il rollback lo ha scartato: nessuna riga resta nel ledger.
      expect(characterDataLedger).toHaveLength(0);
    });
  });

  // T-018: la route di creazione PG apre la propria transazione e passa il
  // `tx` (non un `PrismaClient`) a questa funzione, così Character + grant
  // iniziale + assegnazioni restano atomici in un'unica transazione — niente
  // `$transaction` innestato.
  describe("assignReferenceDataToCharacter — client di transazione già innestato (T-018)", () => {
    it("scrive direttamente sul client ricevuto, senza aprire una nuova transazione, quando il client non espone $transaction", async () => {
      stubEmptyRequirementsAndBalance();
      prismaMock.characterData.create.mockResolvedValue(
        mockCharacterData({
          characterId: 1,
          referenceDataId: 10,
          dataTypeId: 3,
        })
      );
      const character = mockCharacter({ id: 1, campaignId: 1 });
      const definition = mockDefinition({
        referenceData: { flags: { creationOnly: true } },
      });

      // Un `Prisma.TransactionClient` reale non espone `$transaction`: qui lo
      // si simula omettendolo dal client mockato, così `isFullPrismaClient`
      // (interno al servizio) prende il ramo "già in transazione".
      const { $transaction: _omitted, ...txLikeClient } =
        prismaClient as unknown as Record<string, unknown>;

      const result = await assignReferenceDataToCharacter(
        txLikeClient as unknown as typeof prismaClient,
        character,
        definition,
        { isCreation: true }
      );

      expect(result.characterData.referenceDataId).toBe(10);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(prismaMock.characterData.create).toHaveBeenCalledTimes(1);
    });
  });

  // Scenario end-to-end (QA T-017): a differenza dei test sopra — isolati per
  // regola, con `mockResolvedValue`/`mockResolvedValueOnce` puntuali — qui il
  // mock Prisma è "stateful" (stesso pattern del QA end-to-end di
  // `xp.service.test.ts`, T-025): un catalogo `DataRequirement` fisso e due
  // ledger in memoria (`CharacterData`, `XpTransaction`) vengono letti/scritti
  // dalle stesse implementazioni che il servizio invoca, così ogni passo
  // successivo vede davvero l'effetto dei precedenti. Copre in sequenza:
  // cardinalità `single` che sostituisce, `requires` soddisfatto, soglia XP
  // (rifiuto self-assign + override master sotto budget), `blocks`
  // simmetrico via arco ENTRANTE (lo scenario esatto del fix reviewer round
  // 1, qui dentro un flusso reale anziché un mock isolato), atomicità/
  // rollback sotto race TOCTOU, e l'invariante cross-campagna.
  describe("end-to-end scenario (QA T-017): cardinalità + requisiti bidirezionali + soglia XP + override master + atomicità", () => {
    it("orchestrates self-assign → insufficient-XP rejection → master override → symmetric blocks rejection → atomic rollback → cross-campaign rejection on a stateful in-memory catalog", async () => {
      // --- Catalogo (campagna 1: DataType "Passo" single, DataType "Patto"
      // multi; campagna 2: DataType "Alieno", per l'invariante cross-tenant) ---
      const dtStance = mockDataType({
        id: 100,
        campaignId: 1,
        kind: DataTypeKind.talent,
        cardinality: DataCardinality.single,
        assignability: DataTypeAssignability.always,
      });
      const dtPact = mockDataType({
        id: 200,
        campaignId: 1,
        kind: DataTypeKind.talent,
        cardinality: DataCardinality.multi,
        assignability: DataTypeAssignability.always,
      });
      const dtAlien = mockDataType({
        id: 900,
        campaignId: 2,
        kind: DataTypeKind.talent,
        cardinality: DataCardinality.multi,
        assignability: DataTypeAssignability.always,
      });

      const rdBasicStance = mockReferenceData({
        id: 101,
        dataTypeId: 100,
        name: "Passo Base",
        flags: null,
      });
      const rdAdvancedStance = mockReferenceData({
        id: 102,
        dataTypeId: 100,
        name: "Passo Avanzato",
        flags: { cost: 20 },
      });
      const rdMasterBoon = mockReferenceData({
        id: 103,
        dataTypeId: 100,
        name: "Dono del Master",
        flags: { cost: 25 },
      });
      const rdForbiddenPact = mockReferenceData({
        id: 201,
        dataTypeId: 200,
        name: "Patto Proibito",
        flags: { repeatable: false },
      });
      const rdMinorPact = mockReferenceData({
        id: 202,
        dataTypeId: 200,
        name: "Patto Minore",
        flags: { cost: 5 },
      });
      const rdAlienTalent = mockReferenceData({
        id: 901,
        dataTypeId: 900,
        name: "Talento Alieno",
        flags: null,
      });

      const defAdvancedStance = { ...rdAdvancedStance, dataType: dtStance };
      const defMasterBoon = { ...rdMasterBoon, dataType: dtStance };
      const defForbiddenPact = { ...rdForbiddenPact, dataType: dtPact };
      const defMinorPact = { ...rdMinorPact, dataType: dtPact };
      const defAlienTalent = { ...rdAlienTalent, dataType: dtAlien };

      // Grafo requisiti: "Passo Avanzato" *requires* "Passo Base"; "Dono del
      // Master" *blocks* "Patto Proibito" — arco memorizzato uscente da 103
      // verso 201. Valutare 201 (Patto Proibito) deve risolvere il conflitto
      // via `listIncomingRequirements`: è lo scenario esatto del fix reviewer
      // round 1 sui `blocks` unidirezionali.
      const edges = [
        {
          id: 1,
          definitionId: 102,
          requiredDefinitionId: 101,
          type: RequirementType.requires,
          requiredDefinition: rdBasicStance,
          definition: rdAdvancedStance,
        },
        {
          id: 2,
          definitionId: 103,
          requiredDefinitionId: 201,
          type: RequirementType.blocks,
          requiredDefinition: rdForbiddenPact,
          definition: rdMasterBoon,
        },
      ];

      prismaMock.dataRequirement.findMany.mockImplementation((async (args: {
        where: { definitionId?: number; requiredDefinitionId?: number };
      }) => {
        const { where } = args;
        if (where.definitionId !== undefined) {
          return edges
            .filter(e => e.definitionId === where.definitionId)
            .map(e => ({
              id: e.id,
              definitionId: e.definitionId,
              requiredDefinitionId: e.requiredDefinitionId,
              type: e.type,
              requiredDefinition: e.requiredDefinition,
            }));
        }
        return edges
          .filter(e => e.requiredDefinitionId === where.requiredDefinitionId)
          .map(e => ({
            id: e.id,
            definitionId: e.definitionId,
            requiredDefinitionId: e.requiredDefinitionId,
            type: e.type,
            definition: e.definition,
          }));
      }) as never);

      // --- Ledger `CharacterData`: il PG possiede già "Passo Base" ---
      let nextCharacterDataId = 2;
      const characterDataLedger: CharacterData[] = [
        mockCharacterData({
          id: 1,
          characterId: 1,
          referenceDataId: 101,
          dataTypeId: 100,
        }),
      ];

      prismaMock.characterData.findMany.mockImplementation((async (args: {
        where: { characterId: number };
      }) =>
        characterDataLedger.filter(
          cd => cd.characterId === args.where.characterId
        )) as never);
      prismaMock.characterData.findFirst.mockImplementation(
        (async (args: {
          where: { characterId: number; referenceDataId: number };
        }) =>
          characterDataLedger.find(
            cd =>
              cd.characterId === args.where.characterId &&
              cd.referenceDataId === args.where.referenceDataId
          ) ?? null) as never
      );
      prismaMock.characterData.deleteMany.mockImplementation((async (args: {
        where: { characterId: number; dataTypeId: number };
      }) => {
        const before = characterDataLedger.length;
        const kept = characterDataLedger.filter(
          cd =>
            !(
              cd.characterId === args.where.characterId &&
              cd.dataTypeId === args.where.dataTypeId
            )
        );
        characterDataLedger.length = 0;
        characterDataLedger.push(...kept);
        return { count: before - kept.length };
      }) as never);
      prismaMock.characterData.create.mockImplementation((async (args: {
        data: Omit<CharacterData, "id" | "createdAt">;
      }) => {
        const row = mockCharacterData({
          id: nextCharacterDataId++,
          ...args.data,
        });
        characterDataLedger.push(row);
        return row;
      }) as never);

      // --- Ledger `XpTransaction`: saldo iniziale 30 ---
      let nextXpId = 2;
      const xpLedger: XpTransaction[] = [
        {
          id: 1,
          characterId: 1,
          amount: 30,
          reason: XpReason.initialGrant,
          referenceDataId: null,
          actionId: null,
          sourceCharacterId: null,
          createdAt: new Date("2024-01-01"),
        } as XpTransaction,
      ];
      // Arma l'iniezione di una spesa concorrente (-12) subito dopo la
      // *prossima* lettura "settled" del saldo: simula una race TOCTOU tra il
      // pre-check di `evaluateRequirements` (fuori transazione) e il
      // ricontrollo di `debitTalent` dentro la transazione.
      let injectRaceOnNextSettledRead = false;

      prismaMock.xpTransaction.aggregate.mockImplementation((async (args: {
        where: { characterId: number; amount?: { gt: number } };
      }) => {
        const { where } = args;
        // `getXpBalance` interroga `aggregate` due volte per chiamata (XP
        // guadagnati, con `where.amount: {gt: 0}` + saldo netto "settled",
        // senza quel filtro): la race sotto deve scattare SOLO sulla lettura
        // "settled" (quella che il commento sopra chiama "prossima lettura
        // settled del saldo"), mai su quella "earned" interrogata in
        // parallelo.
        const amountFilter = where.amount;
        const isEarnedQuery = amountFilter !== undefined;
        const rows = xpLedger.filter(
          t =>
            t.characterId === where.characterId &&
            (amountFilter === undefined || t.amount > amountFilter.gt)
        );
        const sum = rows.reduce((acc, t) => acc + t.amount, 0);
        const result = { _sum: { amount: rows.length > 0 ? sum : null } };
        if (!isEarnedQuery && injectRaceOnNextSettledRead) {
          injectRaceOnNextSettledRead = false;
          xpLedger.push({
            id: nextXpId++,
            characterId: where.characterId,
            amount: -12,
            reason: XpReason.purchase,
            referenceDataId: 999,
            actionId: null,
            sourceCharacterId: null,
            createdAt: new Date("2024-01-01"),
          } as XpTransaction);
        }
        return result;
      }) as never);
      prismaMock.xpTransaction.create.mockImplementation((async (args: {
        data: {
          characterId: number;
          amount: number;
          reason: XpReason;
          referenceDataId?: number | null;
          actionId?: number | null;
        };
      }) => {
        const row = {
          id: nextXpId++,
          characterId: args.data.characterId,
          amount: args.data.amount,
          reason: args.data.reason,
          referenceDataId: args.data.referenceDataId ?? null,
          actionId: args.data.actionId ?? null,
          sourceCharacterId: null,
          createdAt: new Date("2024-01-01"),
        } as XpTransaction;
        xpLedger.push(row);
        return row;
      }) as never);

      // --- Transazione stateful con rollback reale: snapshot di entrambi i
      // ledger, ripristinati se la callback lancia (stesso pattern del test
      // di atomicità sopra, esteso a due ledger invece di uno) ---
      prismaMock.$transaction.mockImplementation((async (
        fn: (tx: PrismaClient) => Promise<unknown>
      ) => {
        const characterSnapshot = [...characterDataLedger];
        const xpSnapshot = [...xpLedger];
        try {
          return await fn(prismaClient);
        } catch (error) {
          characterDataLedger.length = 0;
          characterDataLedger.push(...characterSnapshot);
          xpLedger.length = 0;
          xpLedger.push(...xpSnapshot);
          throw error;
        }
      }) as never);

      const character = mockCharacter({ id: 1, campaignId: 1 });

      // --- 1. Self-assign "Passo Avanzato": `requires` soddisfatto (possiede
      // "Passo Base"), XP sufficiente (30 ≥ 20) — cardinalità `single`
      // sostituisce "Passo Base" con "Passo Avanzato" nello stesso DataType ---
      const step1 = await assignReferenceDataToCharacter(
        prismaClient,
        character,
        defAdvancedStance
      );
      expect(step1.characterData).toMatchObject({ referenceDataId: 102 });
      expect(step1.xpTransaction).toMatchObject({ amount: -20 });
      expect(
        characterDataLedger.filter(
          cd => cd.characterId === 1 && cd.dataTypeId === 100
        )
      ).toEqual([expect.objectContaining({ referenceDataId: 102 })]);

      // --- 2a. Self-assign "Dono del Master" (costo 25 > saldo residuo 10):
      // rifiutato, nessuna scrittura ---
      const evalMasterBoon = await evaluateRequirements(
        prismaClient,
        character,
        defMasterBoon
      );
      expect(evalMasterBoon).toMatchObject({
        xpCost: 25,
        xpAvailable: 10,
        xpSufficient: false,
        satisfied: false,
      });
      await expect(
        assignReferenceDataToCharacter(prismaClient, character, defMasterBoon)
      ).rejects.toBeInstanceOf(RequirementsNotSatisfiedError);
      expect(characterDataLedger.some(cd => cd.referenceDataId === 103)).toBe(
        false
      );

      // --- 2b. Il master forza la concessione: override registrato,
      // cardinalità `single` sostituisce ancora (via "Passo Avanzato"),
      // addebito comunque eseguito sotto budget (10 → -15) ---
      const step2 = await assignReferenceDataToCharacter(
        prismaClient,
        character,
        defMasterBoon,
        { isMaster: true, grantedById: "master-99" }
      );
      expect(step2.characterData).toMatchObject({
        referenceDataId: 103,
        grantedById: "master-99",
        grantedByOverride: true,
      });
      expect(step2.xpTransaction).toMatchObject({ amount: -25 });
      expect(
        characterDataLedger.filter(
          cd => cd.characterId === 1 && cd.dataTypeId === 100
        )
      ).toEqual([expect.objectContaining({ referenceDataId: 103 })]);

      // --- 3. Self-assign "Patto Proibito": bloccato dal "Dono del Master"
      // ormai posseduto, rilevato solo tramite l'arco ENTRANTE (103 blocks
      // 201) — verifica indipendente del fix reviewer round 1 dentro un
      // flusso end-to-end reale, non un mock isolato per singola unità ---
      const evalForbidden = await evaluateRequirements(
        prismaClient,
        character,
        defForbiddenPact
      );
      expect(evalForbidden.blockingConflicts).toEqual([rdMasterBoon]);
      expect(evalForbidden.xpAvailable).toBe(-15);
      await expect(
        assignReferenceDataToCharacter(
          prismaClient,
          character,
          defForbiddenPact
        )
      ).rejects.toBeInstanceOf(RequirementsNotSatisfiedError);
      expect(characterDataLedger.some(cd => cd.referenceDataId === 201)).toBe(
        false
      );

      // --- 4. Rifinanziamento fuori banda (simula un accredito T-025 già
      // avvenuto: -15 + 30 = 15) e self-assign "Patto Minore" (costo 5) sotto
      // race TOCTOU: il pre-check vede saldo sufficiente, ma tra il pre-check
      // e l'addebito dentro la transazione una spesa concorrente (-12) rompe
      // il saldo — l'addebito fallisce dentro la tx e l'intera assegnazione
      // va in rollback (atomicità: nessuna `CharacterData` orfana) ---
      xpLedger.push({
        id: nextXpId++,
        characterId: 1,
        amount: 30,
        reason: XpReason.refund,
        referenceDataId: null,
        actionId: null,
        sourceCharacterId: null,
        createdAt: new Date("2024-01-01"),
      } as XpTransaction);
      injectRaceOnNextSettledRead = true;
      const characterDataCountBeforeRace = characterDataLedger.length;
      await expect(
        assignReferenceDataToCharacter(prismaClient, character, defMinorPact)
      ).rejects.toBeInstanceOf(InsufficientXpError);
      expect(characterDataLedger).toHaveLength(characterDataCountBeforeRace);
      expect(characterDataLedger.some(cd => cd.referenceDataId === 202)).toBe(
        false
      );

      // --- 5. Invariante cross-campagna: "Talento Alieno" appartiene alla
      // campagna 2, il PG alla campagna 1 — rifiutato prima di qualunque
      // altra lettura, nessun effetto collaterale ---
      const dataRequirementCallsBefore =
        prismaMock.dataRequirement.findMany.mock.calls.length;
      await expect(
        assignReferenceDataToCharacter(prismaClient, character, defAlienTalent)
      ).rejects.toBeInstanceOf(CrossCampaignAssignmentError);
      expect(prismaMock.dataRequirement.findMany.mock.calls.length).toBe(
        dataRequirementCallsBefore
      );
      expect(characterDataLedger.some(cd => cd.referenceDataId === 901)).toBe(
        false
      );
    });
  });
});
