import { Prisma, XpReason, type Character } from "@prisma/client";
import {
  createXpTransaction,
  findInitialGrant,
  getEarnedXpSum,
  getSettledXpSum,
} from "@/lib/repositories/xpTransaction.repository";
import type { PrismaTransactionClient } from "@/lib/repositories/types";

// Servizio ledger XP (T-025): unica fonte di verità del saldo, che resta
// sempre una PROIEZIONE delle righe di `XpTransaction` — nessun campo
// "saldo" viene mai salvato altrove. Ogni funzione accetta `PrismaTransactionClient`
// (PrismaClient o `Prisma.TransactionClient`) come primo argomento, così può
// essere composta dentro la stessa `prisma.$transaction` del chiamante
// (es. T-017: assegnazione talento + addebito atomici).

export interface XpBalance {
  /** XP accumulati nel corso della vita del personaggio (solo importi positivi, non conta gli acquisti). */
  earned: number;
  /** Saldo netto attualmente spendibile (guadagnato meno speso). */
  available: number;
}

export async function getXpBalance(
  prisma: PrismaTransactionClient,
  characterId: number
): Promise<XpBalance> {
  const [earned, available] = await Promise.all([
    getEarnedXpSum(prisma, characterId),
    getSettledXpSum(prisma, characterId),
  ]);
  return { earned, available };
}

// Errore dedicato per distinguere il rifiuto per saldo insufficiente da un
// errore generico (i chiamanti HTTP, es. T-017, lo mappano su un 400/409).
export class InsufficientXpError extends Error {
  readonly available: number;
  readonly cost: number;

  constructor(available: number, cost: number) {
    super(`XP insufficienti: disponibili ${available}, richiesti ${cost}.`);
    this.name = "InsufficientXpError";
    this.available = available;
    this.cost = cost;
  }
}

// Legge un flag numerico da `ReferenceData.flags` (JSON libero, validato per
// `kind` in T-016 — qui ci limitiamo a un controllo runtime minimo perché il
// servizio non conosce lo schema Zod specifico).
function readNumericFlag(flags: Prisma.JsonValue, key: string): number {
  const value =
    flags && typeof flags === "object" && !Array.isArray(flags)
      ? (flags as Record<string, unknown>)[key]
      : undefined;

  if (typeof value !== "number") {
    throw new Error(`flags.${key} mancante o non numerico`);
  }

  return value;
}

// Accredito iniziale di XP determinato dalla razza (`race.flags.startingPx`).
// Idempotente per PG: se esiste già un `initialGrant` per il personaggio,
// restituisce la transazione esistente senza crearne una seconda. Oltre al
// controllo applicativo (`findFirst` prima del `create`), il DB ha un indice
// UNIQUE PARZIALE su `characterId` filtrato per `reason = 'initialGrant'`
// (vedi commento sul modello `XpTransaction` in `prisma/schema.prisma`): due
// chiamate concorrenti sullo stesso PG possono superare entrambe il
// `findFirst` prima che l'altra committi, ma solo una `create` va a buon
// fine, l'altra viola l'indice (Prisma `P2002`). In quel caso non
// propaghiamo l'errore: rileggiamo e restituiamo il grant che ha vinto la
// race, così la funzione resta idempotente anche sotto concorrenza.
export async function grantInitialXp(
  prisma: PrismaTransactionClient,
  character: Pick<Character, "id">,
  race: { id: number; flags: Prisma.JsonValue }
) {
  const existing = await findInitialGrant(prisma, character.id);
  if (existing) {
    return existing;
  }

  const startingPx = readNumericFlag(race.flags, "startingPx");

  try {
    return await createXpTransaction(prisma, {
      characterId: character.id,
      amount: startingPx,
      reason: XpReason.initialGrant,
      referenceDataId: race.id,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const winner = await findInitialGrant(prisma, character.id);
      if (winner) {
        return winner;
      }
    }
    throw error;
  }
}

export interface DebitTalentOptions {
  // Action a cui l'addebito è agganciato (workflow di approvazione, T-019);
  // omesso per acquisti immediati che non richiedono approvazione.
  actionId?: number;
  // Deroga del master: consente l'acquisto anche sotto budget. La decisione
  // di concederla (ruolo dell'utente) resta al chiamante (T-017).
  allowOverride?: boolean;
  // Sovrascrive il costo dichiarato in `referenceData.flags.cost` (T-0xx,
  // concessione master "a costo zero" — regalo di un talento durante
  // l'editing della scheda): la voce resta comunque tracciata in
  // cronologia con un `amount` di `0` invece di essere silenziosamente
  // omessa. Il chiamante decide il valore, questa funzione non applica
  // alcuna logica di sconto propria.
  cost?: number;
  // Nota mostrata in cronologia accanto al nome del talento (T-0xx, vedi
  // `note` in `CreateXpTransactionInput` / `describeXpTransaction` in
  // `ModalXpHistory.tsx`).
  note?: string;
}

// Addebito XP per l'acquisto di un talento (`referenceData.flags.cost`, o
// `options.cost` se il chiamante lo sovrascrive). Rifiuta se
// `available < cost`, salvo `options.allowOverride`.
export async function debitTalent(
  prisma: PrismaTransactionClient,
  character: Pick<Character, "id">,
  referenceData: { id: number; flags: Prisma.JsonValue },
  options: DebitTalentOptions = {}
) {
  const cost = options.cost ?? readNumericFlag(referenceData.flags, "cost");

  if (!options.allowOverride) {
    const { available } = await getXpBalance(prisma, character.id);
    if (available < cost) {
      throw new InsufficientXpError(available, cost);
    }
  }

  return createXpTransaction(prisma, {
    characterId: character.id,
    // `cost === 0 ? 0 : -cost` invece di `-cost` diretto: con un override a
    // costo zero (concessione master) `-0` finirebbe salvato al posto di `0`.
    amount: cost === 0 ? 0 : -cost,
    reason: XpReason.purchase,
    referenceDataId: referenceData.id,
    actionId: options.actionId ?? null,
    note: options.note ?? null,
  });
}

// Primitiva di recupero XP alla morte del PG: registra sul PG successivo un
// accredito con riferimento al PG defunto. Il *quanto* (percentuale/formula)
// è calcolato dall'handler della feature di campagna (T-019), che legge
// `Feature.featureData` e il saldo del defunto, poi chiama questa funzione.
export async function recordDeathRecovery(
  prisma: PrismaTransactionClient,
  sourceCharacter: Pick<Character, "id" | "campaignId">,
  targetCharacter: Pick<Character, "id" | "campaignId">,
  amount: number
) {
  if (amount <= 0) {
    throw new Error("Il recupero XP deve essere un importo positivo");
  }
  if (sourceCharacter.campaignId !== targetCharacter.campaignId) {
    throw new Error(
      "Il recupero XP tra PG di campagne diverse non è consentito"
    );
  }

  return createXpTransaction(prisma, {
    characterId: targetCharacter.id,
    amount,
    reason: XpReason.deathRecovery,
    sourceCharacterId: sourceCharacter.id,
  });
}

export interface UpdateXpOptions {
  updatedByUserId?: string;
  // Motivazione facoltativa (T-0xx, assegnazione bulk admin
  // `CampaignProgress.tsx`): testo libero mostrato in cronologia
  // accanto al nome del master (`ModalXpHistory.tsx`).
  note?: string;
}

// Aggiornamento manuale del master (T-0xx: creazione PG, scheda PG e
// assegnazione bulk admin): registra una `XpTransaction` con
// `reason: update`, attribuita a chi l'ha effettuato (`updatedById`,
// mostrata in cronologia come "Aggiornamento di {nome}",
// `ModalXpHistory.tsx`). A differenza di `debitTalent`,
// nessun controllo di budget: è un aggiornamento manuale del master, può
// anche portare il saldo sotto zero. Non collegata a una voce di catalogo
// (a differenza di `recordTalentRemoval` sotto): è un aggiustamento libero
// del saldo, non un'azione su un talento specifico.
export async function updateXp(
  prisma: PrismaTransactionClient,
  character: Pick<Character, "id">,
  amount: number,
  options: UpdateXpOptions = {}
) {
  return createXpTransaction(prisma, {
    characterId: character.id,
    amount,
    reason: XpReason.update,
    note: options.note ?? null,
    updatedById: options.updatedByUserId ?? null,
  });
}

export interface RecordTalentRemovalOptions {
  updatedByUserId?: string;
}

// Rimozione di un talento posseduto dal master (T-0xx, bottone "Elimina" in
// "Talenti acquisiti"): registra una `XpTransaction` a importo sempre `0`
// (mai un rimborso — il costo già speso resta speso) con `reason: removal`,
// dedicato e distinto da `update` (`updateXp` sopra) così un giocatore che
// guarda la cronologia non confonde una rimozione con un aggiustamento
// manuale del saldo. Nessun controllo di budget: come `updateXp`, è
// un'azione del master, non un acquisto.
export async function recordTalentRemoval(
  prisma: PrismaTransactionClient,
  character: Pick<Character, "id">,
  referenceDataId: number,
  options: RecordTalentRemovalOptions = {}
) {
  return createXpTransaction(prisma, {
    characterId: character.id,
    amount: 0,
    reason: XpReason.removal,
    referenceDataId,
    updatedById: options.updatedByUserId ?? null,
  });
}

export interface RefundOptions {
  referenceDataId?: number;
  actionId?: number;
}

// Annulla l'effetto di un addebito (es. rifiuto di un'approvazione):
// accredita di nuovo `amount` XP con `reason = refund`. `amount` va passato
// positivo (è il chiamante, es. T-017/T-019, a sapere quanto stornare).
export async function refund(
  prisma: PrismaTransactionClient,
  character: Pick<Character, "id">,
  amount: number,
  options: RefundOptions = {}
) {
  if (amount <= 0) {
    throw new Error("Il refund deve essere un importo positivo");
  }

  return createXpTransaction(prisma, {
    characterId: character.id,
    amount,
    reason: XpReason.refund,
    referenceDataId: options.referenceDataId ?? null,
    actionId: options.actionId ?? null,
  });
}
