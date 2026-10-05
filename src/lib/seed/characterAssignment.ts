import type { CharacterData, Prisma } from "@prisma/client";
import {
  debitTalent,
  grantInitialXp,
  type DebitTalentOptions,
} from "@/lib/services/xp.service";
import type { PrismaTransactionClient } from "@/lib/repositories/types";

// Stand-in minimale per il servizio completo di assegnazione dati-PG di T-017
// ("Servizio dati-personaggio: assegnazione con cardinalità, requisiti soft,
// override master, addebito XP"), ancora `status: todo` in questo stack (non
// stackato in T-023 — vedi `.task/023-seed-campagna-esempio.md#Artifacts`).
// Queste funzioni servono SOLO al seed (T-023): riusano il ledger XP reale
// (`xp.service`, T-025) così le `XpTransaction` generate sono coerenti con le
// regole vere, ma NON reimplementano il motore generico di validazione
// cardinalità/requisiti di T-017 — l'ordine delle chiamate nel seed rispetta
// già "a mano" il grafo `requires` (assegna i prerequisiti prima di chi li
// richiede). Quando T-017 atterra, il seed andrebbe fatto migrare al servizio
// vero al posto di questi helper.
//
// Ogni funzione accetta `PrismaTransactionClient` (PrismaClient o
// `Prisma.TransactionClient`) come primo argomento, stessa convenzione di
// `xp.service`: il chiamante (il seed) le compone dentro un
// `prisma.$transaction` quando l'assegnazione della `CharacterData` e
// l'eventuale riga di ledger devono essere atomiche.
//
// Verificato (T-042, bug "ordine di assegnazione batch ignora le
// dipendenze"): questo stand-in NON è esposto allo stesso bug del loop di
// `characters/route.ts` (che valutava i requisiti nell'ordine di arrivo
// client dentro un'unica `$transaction` condivisa). Qui `prisma/seed.ts`
// apre una `prisma.$transaction` SEPARATA per ciascuna chiamata a
// `purchaseTalent`/`assignRaceWithInitialXp` (una voce alla volta, non un
// batch nella stessa transazione), e le chiamate sono già ordinate a mano
// nel file di seed rispettando il grafo `requires` (talentoLama prima di
// talentoFendente, che lo richiede). Nessuna modifica necessaria qui.
//
// Idempotenza: ciascuna funzione controlla prima se esiste già una
// `CharacterData` per la coppia (characterId, referenceDataId) e, se sì, la
// restituisce senza toccare il ledger — un secondo run del seed non duplica
// né l'assegnazione né l'XP.

async function findExistingAssignment(
  prisma: PrismaTransactionClient,
  characterId: number,
  referenceDataId: number
): Promise<CharacterData | null> {
  return prisma.characterData.findFirst({
    where: { characterId, referenceDataId },
  });
}

export interface CharacterRef {
  id: number;
}

export interface ReferenceDataFlagsRef {
  id: number;
  dataTypeId: number;
  flags: Prisma.JsonValue;
}

// Assegna una razza al PG e accredita il grant XP iniziale
// (`race.flags.startingPx`, via `grantInitialXp`). Pensata per essere
// composta dentro `prisma.$transaction` dal chiamante, così la
// `CharacterData` e la `XpTransaction` nascono insieme o non nascono affatto.
export async function assignRaceWithInitialXp(
  prisma: PrismaTransactionClient,
  character: CharacterRef,
  race: ReferenceDataFlagsRef
): Promise<CharacterData> {
  const existing = await findExistingAssignment(prisma, character.id, race.id);
  if (existing) return existing;

  const characterData = await prisma.characterData.create({
    data: {
      characterId: character.id,
      referenceDataId: race.id,
      dataTypeId: race.dataTypeId,
    },
  });
  await grantInitialXp(prisma, character, race);
  return characterData;
}

// Assegna una `ReferenceData` senza costo XP (es. religioni, cardinalità
// multi): nessun ledger coinvolto, solo la riga `CharacterData`.
export async function assignCharacterData(
  prisma: PrismaTransactionClient,
  character: CharacterRef,
  referenceData: { id: number; dataTypeId: number }
): Promise<CharacterData> {
  const existing = await findExistingAssignment(
    prisma,
    character.id,
    referenceData.id
  );
  if (existing) return existing;

  return prisma.characterData.create({
    data: {
      characterId: character.id,
      referenceDataId: referenceData.id,
      dataTypeId: referenceData.dataTypeId,
    },
  });
}

export interface PurchaseTalentOptions extends DebitTalentOptions {
  // Master che ha concesso l'acquisto: valorizzato solo per gli acquisti in
  // deroga (`grantedByOverride: true`), coerente con `CharacterData.grantedById`.
  grantedById?: string | null;
  grantedByOverride?: boolean;
}

// Acquisto di un talento: addebita `referenceData.flags.cost` (via
// `debitTalent`, che rifiuta se gli XP disponibili non bastano) e crea la
// `CharacterData` corrispondente. `options.grantedByOverride` marca
// l'assegnazione come deroga del master (bypassa sia il check di XP
// disponibili sotto, passando `allowOverride` a `debitTalent`, sia — a monte,
// per costruzione del seed — il requisito `requires` non soddisfatto: questo
// helper non valuta il grafo requisiti, è il chiamante a decidere se forzare).
export async function purchaseTalent(
  prisma: PrismaTransactionClient,
  character: CharacterRef,
  talent: ReferenceDataFlagsRef,
  options: PurchaseTalentOptions = {}
): Promise<CharacterData> {
  const existing = await findExistingAssignment(
    prisma,
    character.id,
    talent.id
  );
  if (existing) return existing;

  await debitTalent(prisma, character, talent, {
    allowOverride: options.grantedByOverride ?? options.allowOverride,
    actionId: options.actionId,
  });

  return prisma.characterData.create({
    data: {
      characterId: character.id,
      referenceDataId: talent.id,
      dataTypeId: talent.dataTypeId,
      grantedByOverride: options.grantedByOverride ?? false,
      grantedById: options.grantedById ?? null,
    },
  });
}
