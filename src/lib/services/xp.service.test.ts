import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma, XpReason, type XpTransaction } from "@prisma/client";
import {
  debitTalent,
  getXpBalance,
  grantInitialXp,
  InsufficientXpError,
  recordDeathRecovery,
  recordTalentRemoval,
  refund,
  updateXp,
} from "./xp.service";
import { prismaMock, prismaClient } from "@/test/mocks/prisma";
import {
  mockCharacter,
  mockXpTransaction,
} from "@/test/helpers/prisma-fixtures";

describe("XP service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getXpBalance", () => {
    it("should compute earned (only positive amounts) and available (net) separately from the ledger", async () => {
      prismaMock.xpTransaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 30 } } as never) // earned
        .mockResolvedValueOnce({ _sum: { amount: 18 } } as never); // available

      const result = await getXpBalance(prismaClient, 1);

      expect(result).toEqual({ earned: 30, available: 18 });
    });
  });

  describe("grantInitialXp", () => {
    it("should grant the race's startingPx when no initial grant exists", async () => {
      prismaMock.xpTransaction.findFirst.mockResolvedValue(null);
      const transaction = mockXpTransaction({
        amount: 15,
        reason: XpReason.initialGrant,
        referenceDataId: 2,
      });
      prismaMock.xpTransaction.create.mockResolvedValue(transaction);

      const result = await grantInitialXp(
        prismaClient,
        { id: 1 },
        { id: 2, flags: { startingPx: 15 } }
      );

      expect(result).toEqual(transaction);
      expect(prismaMock.xpTransaction.create).toHaveBeenCalledWith({
        data: {
          characterId: 1,
          amount: 15,
          reason: XpReason.initialGrant,
          referenceDataId: 2,
        },
      });
    });

    it("should be idempotent: a second call returns the existing grant untouched", async () => {
      const existing = mockXpTransaction({ reason: XpReason.initialGrant });
      prismaMock.xpTransaction.findFirst.mockResolvedValue(existing);

      const result = await grantInitialXp(
        prismaClient,
        { id: 1 },
        { id: 2, flags: { startingPx: 15 } }
      );

      expect(result).toEqual(existing);
      expect(prismaMock.xpTransaction.create).not.toHaveBeenCalled();
    });

    it("should reject a race with a non-numeric startingPx flag", async () => {
      prismaMock.xpTransaction.findFirst.mockResolvedValue(null);

      await expect(
        grantInitialXp(prismaClient, { id: 1 }, { id: 2, flags: null })
      ).rejects.toThrow(/startingPx/);
      expect(prismaMock.xpTransaction.create).not.toHaveBeenCalled();
    });

    it("should stay idempotent under a concurrent race: a create rejected by the DB unique partial index returns the winner's grant instead of throwing", async () => {
      // Entrambe le chiamate concorrenti superano il `findFirst` (nessun
      // grant esiste ancora), ma solo una `create` va a buon fine: l'altra
      // viola l'indice UNIQUE PARZIALE `XpTransactionInitialGrantUnique`
      // (migrazione 20260714100000) e Prisma la segnala con `P2002`.
      prismaMock.xpTransaction.findFirst.mockResolvedValueOnce(null);
      const winner = mockXpTransaction({
        characterId: 1,
        amount: 15,
        reason: XpReason.initialGrant,
        referenceDataId: 2,
      });
      prismaMock.xpTransaction.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "6.19.3",
        })
      );
      // Rilettura dopo il conflitto: trova il grant creato dall'altra
      // chiamata concorrente.
      prismaMock.xpTransaction.findFirst.mockResolvedValueOnce(winner);

      const result = await grantInitialXp(
        prismaClient,
        { id: 1 },
        { id: 2, flags: { startingPx: 15 } }
      );

      expect(result).toEqual(winner);
      expect(prismaMock.xpTransaction.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.xpTransaction.findFirst).toHaveBeenCalledTimes(2);
    });

    it("should rethrow a P2002 conflict if no grant is found on reread (unexpected state)", async () => {
      prismaMock.xpTransaction.findFirst.mockResolvedValueOnce(null);
      prismaMock.xpTransaction.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "6.19.3",
        })
      );
      prismaMock.xpTransaction.findFirst.mockResolvedValueOnce(null);

      await expect(
        grantInitialXp(
          prismaClient,
          { id: 1 },
          { id: 2, flags: { startingPx: 15 } }
        )
      ).rejects.toMatchObject({ code: "P2002" });
    });

    it("should propagate non-P2002 errors from the create untouched", async () => {
      prismaMock.xpTransaction.findFirst.mockResolvedValueOnce(null);
      const dbError = new Error("connessione al database interrotta");
      prismaMock.xpTransaction.create.mockRejectedValueOnce(dbError);

      await expect(
        grantInitialXp(
          prismaClient,
          { id: 1 },
          { id: 2, flags: { startingPx: 15 } }
        )
      ).rejects.toBe(dbError);
    });
  });

  describe("debitTalent", () => {
    it("should debit the reference data's cost when the budget is sufficient", async () => {
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 20 },
      } as never);
      const transaction = mockXpTransaction({
        amount: -12,
        reason: XpReason.purchase,
        referenceDataId: 5,
        actionId: 9,
      });
      prismaMock.xpTransaction.create.mockResolvedValue(transaction);

      const result = await debitTalent(
        prismaClient,
        { id: 1 },
        { id: 5, flags: { cost: 12 } },
        { actionId: 9 }
      );

      expect(result).toEqual(transaction);
      expect(prismaMock.xpTransaction.create).toHaveBeenCalledWith({
        data: {
          characterId: 1,
          amount: -12,
          reason: XpReason.purchase,
          referenceDataId: 5,
          actionId: 9,
          note: null,
        },
      });
    });

    it("should reject with InsufficientXpError when available < cost", async () => {
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 5 },
      } as never);

      await expect(
        debitTalent(prismaClient, { id: 1 }, { id: 5, flags: { cost: 12 } })
      ).rejects.toBeInstanceOf(InsufficientXpError);
      expect(prismaMock.xpTransaction.create).not.toHaveBeenCalled();
    });

    it("should allow the master override even when the budget is insufficient", async () => {
      const transaction = mockXpTransaction({
        amount: -12,
        reason: XpReason.purchase,
      });
      prismaMock.xpTransaction.create.mockResolvedValue(transaction);

      const result = await debitTalent(
        prismaClient,
        { id: 1 },
        { id: 5, flags: { cost: 12 } },
        { allowOverride: true }
      );

      expect(result).toEqual(transaction);
      // Con la deroga non deve nemmeno interrogare il saldo.
      expect(prismaMock.xpTransaction.aggregate).not.toHaveBeenCalled();
    });

    it("should record a zero-amount transaction with a note when the caller overrides the cost (master free grant), without checking the balance", async () => {
      const transaction = mockXpTransaction({
        amount: 0,
        reason: XpReason.purchase,
        referenceDataId: 5,
      });
      prismaMock.xpTransaction.create.mockResolvedValue(transaction);

      const result = await debitTalent(
        prismaClient,
        { id: 1 },
        { id: 5, flags: { cost: 12 } },
        {
          cost: 0,
          allowOverride: true,
          note: "Concesso dal master a costo zero",
        }
      );

      expect(result).toEqual(transaction);
      expect(prismaMock.xpTransaction.aggregate).not.toHaveBeenCalled();
      expect(prismaMock.xpTransaction.create).toHaveBeenCalledWith({
        data: {
          characterId: 1,
          amount: 0,
          reason: XpReason.purchase,
          referenceDataId: 5,
          actionId: null,
          note: "Concesso dal master a costo zero",
        },
      });
    });

    it("should still reject an overridden cost against an insufficient balance when allowOverride is not also set", async () => {
      // `_sum: { amount: 0 }`: saldo disponibile 0, sotto il costo forzato
      // di 5.
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      } as never);

      await expect(
        debitTalent(
          prismaClient,
          { id: 1 },
          { id: 5, flags: { cost: 12 } },
          { cost: 5 }
        )
      ).rejects.toBeInstanceOf(InsufficientXpError);
      expect(prismaMock.xpTransaction.create).not.toHaveBeenCalled();
    });
  });

  describe("recordDeathRecovery", () => {
    it("should record the recovery on the successor with a reference to the deceased PG", async () => {
      const source = mockCharacter({
        id: 1,
        campaignId: 1,
        deathDate: new Date(),
      });
      const target = mockCharacter({ id: 2, campaignId: 1 });
      const transaction = mockXpTransaction({
        characterId: 2,
        amount: 7,
        reason: XpReason.deathRecovery,
        sourceCharacterId: 1,
      });
      prismaMock.xpTransaction.create.mockResolvedValue(transaction);

      const result = await recordDeathRecovery(prismaClient, source, target, 7);

      expect(result).toEqual(transaction);
      expect(prismaMock.xpTransaction.create).toHaveBeenCalledWith({
        data: {
          characterId: 2,
          amount: 7,
          reason: XpReason.deathRecovery,
          sourceCharacterId: 1,
        },
      });
    });

    it("should reject a non-positive amount", async () => {
      const source = mockCharacter({ id: 1, campaignId: 1 });
      const target = mockCharacter({ id: 2, campaignId: 1 });

      await expect(
        recordDeathRecovery(prismaClient, source, target, 0)
      ).rejects.toThrow(/positivo/);
      expect(prismaMock.xpTransaction.create).not.toHaveBeenCalled();
    });

    it("should not let XP recovery cross campaigns", async () => {
      const source = mockCharacter({ id: 1, campaignId: 1 });
      const target = mockCharacter({ id: 2, campaignId: 2 });

      await expect(
        recordDeathRecovery(prismaClient, source, target, 7)
      ).rejects.toThrow(/campagne diverse/);
      expect(prismaMock.xpTransaction.create).not.toHaveBeenCalled();
    });
  });

  describe("refund", () => {
    it("should credit back a positive amount with reason = refund", async () => {
      const transaction = mockXpTransaction({
        amount: 12,
        reason: XpReason.refund,
        referenceDataId: 5,
        actionId: 9,
      });
      prismaMock.xpTransaction.create.mockResolvedValue(transaction);

      const result = await refund(prismaClient, { id: 1 }, 12, {
        referenceDataId: 5,
        actionId: 9,
      });

      expect(result).toEqual(transaction);
      expect(prismaMock.xpTransaction.create).toHaveBeenCalledWith({
        data: {
          characterId: 1,
          amount: 12,
          reason: XpReason.refund,
          referenceDataId: 5,
          actionId: 9,
        },
      });
    });

    it("should reject a non-positive amount", async () => {
      await expect(refund(prismaClient, { id: 1 }, 0)).rejects.toThrow(
        /positivo/
      );
      expect(prismaMock.xpTransaction.create).not.toHaveBeenCalled();
    });
  });

  describe("updateXp", () => {
    it("should create a transaction with reason = update attributed to the master, with an optional note", async () => {
      const transaction = mockXpTransaction({
        amount: 5,
        reason: XpReason.update,
        updatedById: "master-1",
        note: "Bonus di fine evento",
      });
      prismaMock.xpTransaction.create.mockResolvedValue(transaction);

      const result = await updateXp(prismaClient, { id: 1 }, 5, {
        updatedByUserId: "master-1",
        note: "Bonus di fine evento",
      });

      expect(result).toEqual(transaction);
      expect(prismaMock.xpTransaction.create).toHaveBeenCalledWith({
        data: {
          characterId: 1,
          amount: 5,
          reason: XpReason.update,
          note: "Bonus di fine evento",
          updatedById: "master-1",
        },
      });
    });

    it("should accept a negative amount without any budget check, and default note to null when omitted", async () => {
      const transaction = mockXpTransaction({
        amount: -3,
        reason: XpReason.update,
      });
      prismaMock.xpTransaction.create.mockResolvedValue(transaction);

      await updateXp(prismaClient, { id: 1 }, -3);

      expect(prismaMock.xpTransaction.create).toHaveBeenCalledWith({
        data: {
          characterId: 1,
          amount: -3,
          reason: XpReason.update,
          note: null,
          updatedById: null,
        },
      });
    });
  });

  describe("recordTalentRemoval", () => {
    it("should record a zero-amount transaction with reason = removal, linked to the reference data and attributed to the master", async () => {
      const transaction = mockXpTransaction({
        amount: 0,
        reason: XpReason.removal,
        referenceDataId: 10,
        updatedById: "master-1",
      });
      prismaMock.xpTransaction.create.mockResolvedValue(transaction);

      const result = await recordTalentRemoval(prismaClient, { id: 1 }, 10, {
        updatedByUserId: "master-1",
      });

      expect(result).toEqual(transaction);
      expect(prismaMock.xpTransaction.create).toHaveBeenCalledWith({
        data: {
          characterId: 1,
          amount: 0,
          reason: XpReason.removal,
          referenceDataId: 10,
          updatedById: "master-1",
        },
      });
    });

    it("should default updatedById to null when omitted, without any budget check", async () => {
      const transaction = mockXpTransaction({
        amount: 0,
        reason: XpReason.removal,
        referenceDataId: 10,
      });
      prismaMock.xpTransaction.create.mockResolvedValue(transaction);

      await recordTalentRemoval(prismaClient, { id: 1 }, 10);

      expect(prismaMock.xpTransaction.aggregate).not.toHaveBeenCalled();
      expect(prismaMock.xpTransaction.create).toHaveBeenCalledWith({
        data: {
          characterId: 1,
          amount: 0,
          reason: XpReason.removal,
          referenceDataId: 10,
          updatedById: null,
        },
      });
    });
  });

  // Scenario end-to-end (QA T-025): a differenza dei test sopra — uno
  // scenario isolato per funzione, con `mockResolvedValueOnce` puntuali che
  // non condividono stato — qui il mock Prisma è "stateful": un ledger
  // (array) viene aggiornato dalle stesse implementazioni di
  // `create`/`findFirst`/`aggregate` che il servizio invoca, così ogni
  // chiamata successiva vede davvero l'effetto delle precedenti. Riproduce
  // la sequenza reale che T-017/T-018 orchestreranno: grant iniziale →
  // acquisto immediato → secondo acquisto immediato → rifiuto sopra budget
  // → override master → recupero morte sul PG successore. Ogni addebito ha
  // sempre effetto immediato: nessuna Action è mai "in attesa". Pattern di
  // mock stateful coerente con quello già in uso per `@/lib/db` in
  // `src/app/__tests__/cross-task-integration.test.tsx`.
  describe("end-to-end scenario (realistic T-017/T-018 sequence)", () => {
    it("orchestrates grant → immediate debits → insufficient rejection → override → death recovery on a stateful in-memory ledger", async () => {
      let nextId = 1;
      const ledger: XpTransaction[] = [];

      // I mock sotto usano `Prisma.*Args["data"]`/`["where"]` reali come tipo
      // dell'argomento (niente `args: any`): solo il *valore di ritorno* è
      // castato `as never`, perché il tipo reale dei metodi Prisma è un
      // `Prisma__XxxClient` "thenable" fluente (supporta `.then`/`.catch` più
      // `include` chainabili), non una `Promise` semplice — lo stesso motivo
      // per cui i test sopra usano `.mockResolvedValueOnce(... as never)`.
      prismaMock.xpTransaction.create.mockImplementation((async (args: {
        data: {
          characterId: number;
          amount: number;
          reason: XpReason;
          referenceDataId?: number | null;
          actionId?: number | null;
          sourceCharacterId?: number | null;
        };
      }) => {
        const { data } = args;

        // Stessa garanzia dell'indice UNIQUE PARZIALE reale (migrazione
        // 20260714100000): un solo `initialGrant` per personaggio.
        if (
          data.reason === XpReason.initialGrant &&
          ledger.some(
            t =>
              t.characterId === data.characterId &&
              t.reason === XpReason.initialGrant
          )
        ) {
          throw new Prisma.PrismaClientKnownRequestError(
            "Unique constraint failed",
            { code: "P2002", clientVersion: "6.19.3" }
          );
        }

        const row = mockXpTransaction({
          id: nextId++,
          characterId: data.characterId,
          amount: data.amount,
          reason: data.reason,
          referenceDataId: data.referenceDataId ?? null,
          actionId: data.actionId ?? null,
          sourceCharacterId: data.sourceCharacterId ?? null,
        });
        ledger.push(row);
        return row;
      }) as never);

      prismaMock.xpTransaction.findFirst.mockImplementation((async (args: {
        where: { characterId: number; reason: XpReason };
      }) => {
        const { where } = args;
        return (
          ledger.find(
            t =>
              t.characterId === where.characterId && t.reason === where.reason
          ) ?? null
        );
      }) as never);

      prismaMock.xpTransaction.aggregate.mockImplementation((async (args: {
        where: { characterId: number; amount?: { gt: number } };
      }) => {
        const { where } = args;
        const rows = ledger.filter(
          t =>
            t.characterId === where.characterId &&
            (where.amount === undefined || t.amount > where.amount.gt)
        );
        const sum = rows.reduce((acc, t) => acc + t.amount, 0);
        return { _sum: { amount: rows.length > 0 ? sum : null } };
      }) as never);

      // --- 1. PG riceve il grant iniziale (razza con startingPx = 20) ---
      const pg = mockCharacter({ id: 10, campaignId: 1 });
      const race = { id: 500, flags: { startingPx: 20 } };
      const grant = await grantInitialXp(prismaClient, pg, race);
      expect(grant).toMatchObject({
        characterId: 10,
        amount: 20,
        reason: XpReason.initialGrant,
        referenceDataId: 500,
      });

      let balance = await getXpBalance(prismaClient, pg.id);
      expect(balance).toEqual({ earned: 20, available: 20 });

      // --- 2. Addebito immediato per un talento da 8 XP (nessuna Action) ---
      const talentA = { id: 600, flags: { cost: 8 } };
      const debitA = await debitTalent(prismaClient, pg, talentA);
      expect(debitA).toMatchObject({ characterId: 10, amount: -8 });

      balance = await getXpBalance(prismaClient, pg.id);
      expect(balance).toEqual({ earned: 20, available: 12 });

      // --- 3. Un secondo addebito (5 XP), legato a un'Action: ha comunque
      // effetto immediato sul saldo, come qualunque altro addebito ---
      const talentB = { id: 601, flags: { cost: 5 } };
      const debitB = await debitTalent(prismaClient, pg, talentB, {
        actionId: 50,
      });
      expect(debitB).toMatchObject({ amount: -5, actionId: 50 });

      balance = await getXpBalance(prismaClient, pg.id);
      expect(balance).toEqual({ earned: 20, available: 7 });

      // --- 4. Un terzo acquisto (10 XP) supera il saldo residuo (7):
      // rifiutato senza scrivere alcuna riga ---
      const talentC = { id: 602, flags: { cost: 10 } };
      const ledgerLengthBeforeRejection = ledger.length;
      await expect(
        debitTalent(prismaClient, pg, talentC)
      ).rejects.toBeInstanceOf(InsufficientXpError);
      expect(ledger).toHaveLength(ledgerLengthBeforeRejection);

      balance = await getXpBalance(prismaClient, pg.id);
      expect(balance).toEqual({ earned: 20, available: 7 });

      // --- Lo stesso acquisto con `allowOverride: true` (master): passa
      // anche sotto budget, salta del tutto il controllo saldo ---
      const debitC = await debitTalent(prismaClient, pg, talentC, {
        allowOverride: true,
      });
      expect(debitC).toMatchObject({ amount: -10 });

      balance = await getXpBalance(prismaClient, pg.id);
      expect(balance).toEqual({ earned: 20, available: -3 });

      // --- 5. Il PG muore; il successore nella stessa campagna riceve il
      // recupero XP (primitiva: solo registrazione, quota decisa altrove) ---
      const deceased = mockCharacter({
        id: 10,
        campaignId: 1,
        deathDate: new Date("2026-07-14"),
      });
      const successor = mockCharacter({ id: 11, campaignId: 1 });
      const recovery = await recordDeathRecovery(
        prismaClient,
        deceased,
        successor,
        6
      );
      expect(recovery).toMatchObject({
        characterId: 11,
        amount: 6,
        reason: XpReason.deathRecovery,
        sourceCharacterId: 10,
      });

      const successorBalance = await getXpBalance(prismaClient, successor.id);
      expect(successorBalance).toEqual({
        earned: 6,
        available: 6,
      });

      // Il ledger del PG defunto resta intatto e separato da quello del
      // successore (nessuna fusione/azzeramento implicito).
      const deceasedBalance = await getXpBalance(prismaClient, deceased.id);
      expect(deceasedBalance).toEqual({
        earned: 20,
        available: -3,
      });
    });

    // Finding 🟡 della review (non bloccante): conferma con i fatti che il
    // trust boundary dichiarato nelle `decisions` del task file è esattamente
    // quello — nessun controllo di scoping campagna dentro `debitTalent`/
    // `grantInitialXp` su `referenceData`/`race`, si fidano del chiamante.
    it("does not verify that referenceData/race belong to the character's campaign (documented trust boundary, not enforced here)", async () => {
      prismaMock.xpTransaction.findFirst.mockResolvedValue(null);
      const grantTx = mockXpTransaction({ reason: XpReason.initialGrant });
      prismaMock.xpTransaction.create.mockResolvedValue(grantTx);

      const pgInCampaign1 = mockCharacter({ id: 1, campaignId: 1 });
      // Razza "di un'altra campagna" nella realtà (nessun campaignId qui
      // perché la firma del servizio accetta solo `{ id, flags }`): il
      // servizio non ha modo di rifiutarla, e infatti non lo fa.
      const raceFromAnotherCampaign = { id: 999, flags: { startingPx: 20 } };

      await expect(
        grantInitialXp(prismaClient, pgInCampaign1, raceFromAnotherCampaign)
      ).resolves.toEqual(grantTx);
      // Nessun controllo di campagna sulla razza: viene passata pari pari
      // come `referenceDataId` nella riga del ledger.
      expect(prismaMock.xpTransaction.create).toHaveBeenCalledWith({
        data: {
          characterId: 1,
          amount: 20,
          reason: XpReason.initialGrant,
          referenceDataId: 999,
        },
      });

      vi.clearAllMocks();
      prismaMock.xpTransaction.aggregate.mockResolvedValue({
        _sum: { amount: 100 },
      } as never);
      const purchaseTx = mockXpTransaction({
        amount: -3,
        reason: XpReason.purchase,
      });
      prismaMock.xpTransaction.create.mockResolvedValue(purchaseTx);

      const referenceDataFromAnotherCampaign = { id: 998, flags: { cost: 3 } };
      await expect(
        debitTalent(
          prismaClient,
          pgInCampaign1,
          referenceDataFromAnotherCampaign
        )
      ).resolves.toEqual(purchaseTx);
      expect(prismaMock.xpTransaction.create).toHaveBeenCalledWith({
        data: {
          characterId: 1,
          amount: -3,
          reason: XpReason.purchase,
          referenceDataId: 998,
          actionId: null,
          note: null,
        },
      });
    });
  });
});
