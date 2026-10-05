import { cache } from "react";
import {
  CharacterType,
  type Character,
  type CharacterData,
  type DataCardinality,
  type DataTypeKind,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import type { PrismaTransactionClient } from "./types";
import { sumPointBonuses, type PointBonus } from "@/lib/features/pointBonus";

export interface ListUserCharactersOptions {
  userId: string;
  campaignSlug?: string;
  take?: number;
  // Solo PG deceduti (`deathDate` valorizzato) — usato dal picker di
  // recupero XP alla morte in creazione PG (`CharacterCreation.tsx`), che
  // deve proporre solo i propri personaggi già morti come "donatori".
  deceasedOnly?: boolean;
}

export async function listUserCharacters(
  prisma: PrismaClient,
  options: ListUserCharactersOptions
) {
  const { userId, campaignSlug, take = 10, deceasedOnly = false } = options;

  const where: Prisma.CharacterWhereInput = {
    userId,
    ...(campaignSlug ? { campaign: { slug: campaignSlug } } : {}),
    ...(deceasedOnly ? { deathDate: { not: null } } : {}),
  };

  return prisma.character.findMany({
    where,
    include: {
      campaign: {
        select: {
          name: true,
          slug: true,
          organization: { select: { slug: true } },
        },
      },
      user: { select: { name: true } },
    },
    orderBy: [
      { deathDate: { sort: "desc", nulls: "first" } },
      { approvalDate: { sort: "desc", nulls: "first" } },
      { creationDate: "desc" },
    ],
    take,
  });
}

// Elenca tutti i personaggi di una campagna (ogni giocatore), per la vista
// staff "Personaggi" sotto l'Area Master. A differenza di listUserCharacters
// non filtra per userId: l'autorizzazione (head_master/super-admin) è
// responsabilità del chiamante (requireCampaignAdminBySlug).
export async function listCampaignCharacters(
  prisma: PrismaClient | PrismaTransactionClient,
  campaignId: number
) {
  return prisma.character.findMany({
    where: { campaignId },
    include: {
      user: { select: { id: true, name: true, image: true } },
    },
    orderBy: [{ name: "asc" }],
  });
}

// Personaggi della campagna per l'Area Stampa: date per lo stato derivato e
// eventi a cui sono iscritti (filtri "stato" ed "evento" della selezione).
// Query a parte e non `include` in `listCampaignCharacters`, che finisce
// anche in risposte API. Autorizzazione a carico del chiamante.
export async function listCampaignCharactersForPrint(
  prisma: PrismaClient,
  campaignId: number
) {
  return prisma.character.findMany({
    where: { campaignId },
    select: {
      id: true,
      name: true,
      approvalDate: true,
      parkDate: true,
      deathDate: true,
      user: { select: { name: true } },
      bookings: {
        select: {
          event: { select: { id: true, name: true, dateEventStart: true } },
        },
      },
    },
    orderBy: [{ name: "asc" }],
  });
}

// Shape restituita da `listCampaignCharactersForReport`: solo i campi che
// servono ad aggregare la pagina "Report Personaggi" (stato derivato,
// tipo, proprietario, e le assegnazioni per categoria) — non l'intero
// `Character` con `include` come `listCampaignCharacters`, perché qui il
// consumer è un client component che aggrega in memoria, non una scheda.
export type CampaignCharacterReportRow = Pick<
  Character,
  | "id"
  | "name"
  | "type"
  | "avatar"
  | "lastUpdateDate"
  | "approvalDate"
  | "parkDate"
  | "deathDate"
> & {
  user: { name: string };
  characterData: (Pick<CharacterData, "id"> & {
    referenceData: { name: string };
    dataType: {
      id: number;
      name: string;
      kind: DataTypeKind;
      cardinality: DataCardinality | null;
    };
  })[];
};

// Tutti i personaggi di una campagna con le loro `CharacterData` (per
// categoria `DataType`), per la vista staff "Report Personaggi"
// (aggregazione Razza/Fazione/Divinità/Stato, dinamica per campagna). Come
// `listCampaignCharacters`, non filtra: l'autorizzazione è responsabilità
// del chiamante (`admin/layout.tsx`).
export async function listCampaignCharactersForReport(
  prisma: PrismaClient,
  campaignId: number
): Promise<CampaignCharacterReportRow[]> {
  return prisma.character.findMany({
    where: { campaignId },
    select: {
      id: true,
      name: true,
      type: true,
      avatar: true,
      lastUpdateDate: true,
      approvalDate: true,
      parkDate: true,
      deathDate: true,
      user: { select: { name: true } },
      characterData: {
        select: {
          id: true,
          referenceData: { select: { name: true } },
          dataType: {
            select: { id: true, name: true, kind: true, cardinality: true },
          },
        },
      },
    },
    orderBy: [{ name: "asc" }],
  });
}

// Personaggi scelti per l'Area Stampa, con le voci assegnate per
// `DataType`. Scopata a campagna: un id di un'altra campagna viene ignorato.
export async function listCharactersForPrint(
  prisma: PrismaClient,
  campaignId: number,
  ids: number[]
) {
  return prisma.character.findMany({
    where: { campaignId, id: { in: ids } },
    select: {
      id: true,
      name: true,
      type: true,
      avatar: true,
      background: true,
      masterPublicNotes: true,
      user: { select: { name: true } },
      characterData: {
        select: {
          referenceData: { select: { name: true } },
          dataType: { select: { name: true } },
        },
        orderBy: { id: "asc" },
      },
    },
  });
}

// `cache()` (React, dedup per-request): la scheda personaggio risolve lo
// stesso `Character` fino a 3 volte nella stessa request (guardia layout,
// `generateMetadata`, `getCharacterEditorData`) — wrapparlo qui, non nei
// singoli chiamanti, fa condividere la memoizzazione a tutti senza doverla
// ripetere ad ogni call site (stesso pattern di `getCampaignBySlug`).
export const getCharacterByIdScoped = cache(
  async function getCharacterByIdScoped(
    prisma: PrismaClient,
    characterId: number,
    orgSlug: string,
    campaignSlug: string
  ) {
    return prisma.character.findUnique({
      where: {
        id: characterId,
        campaign: {
          slug: campaignSlug,
          organization: { slug: orgSlug },
        },
      },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            slug: true,
            logo: true,
            organization: { select: { slug: true } },
          },
        },
        user: { select: { id: true, name: true } },
        bookings: {
          select: {
            id: true,
            bookingDate: true,
            paymentDate: true,
            present: true,
            event: {
              select: {
                id: true,
                name: true,
                dateEventStart: true,
                place: true,
              },
            },
          },
          orderBy: { event: { dateEventStart: "desc" } },
          take: 20,
        },
      },
    });
  }
);

// Scoping diretto per `campaignId` (a differenza di `getCharacterByIdScoped`,
// che richiede `orgSlug`/`campaignSlug`): usata dagli handler feature del
// registry (T-019, es. recupero XP alla morte) che ricevono già la campagna
// risolta come `{ id }` e non hanno bisogno degli slug né delle relazioni
// caricate da quella query. Accetta `PrismaTransactionClient` (T-0xx,
// risposte alle missive): l'handler `missive` risolve il destinatario di una
// risposta DENTRO la stessa transazione dell'eligibility check/spend, per
// evitare la finestra di race fra la lettura e la scrittura.
export async function getCharacterInCampaign(
  prisma: PrismaTransactionClient,
  characterId: number,
  campaignId: number
) {
  return prisma.character.findUnique({
    where: { id: characterId, campaignId },
  });
}

// Il "personaggio del viewer" per una campagna, usato dal contesto di
// valutazione della visibilità (T-020/T-026: `VisibilityContext.character`).
// Un utente può avere più `Character` nella stessa campagna (nessun vincolo
// unique a schema): stessa priorità di `listUserCharacters` — vivo prima di
// morto, approvato prima di in bozza, più recente a parità — per restare
// coerenti con "il personaggio principale" mostrato altrove.
export async function getUserCharacterInCampaign(
  prisma: PrismaClient,
  userId: string,
  campaignId: number
) {
  return prisma.character.findFirst({
    where: { userId, campaignId },
    orderBy: [
      { deathDate: { sort: "desc", nulls: "first" } },
      { approvalDate: { sort: "desc", nulls: "first" } },
      { creationDate: "desc" },
    ],
  });
}

export async function getCharacterOwnership(
  prisma: PrismaClient,
  characterId: number
) {
  return prisma.character.findUnique({
    where: { id: characterId },
    select: {
      id: true,
      userId: true,
      campaignId: true,
      avatar: true,
      // Necessari al chiamante (`PUT /api/characters/[id]`) per calcolare
      // lo status derivato PRIMA dell'update, e rilevare un cambio-stato.
      approvalDate: true,
      parkDate: true,
      deathDate: true,
      campaign: { select: { slug: true } },
    },
  });
}

export interface UpdateCharacterData {
  name?: string;
  avatar?: string | null;
  background?: string;
  type?: CharacterType;
  playerNotes?: string | null;
  masterPublicNotes?: string | null;
  masterNotes?: string | null;
  approvalDate?: Date | null;
  deathDate?: Date | null;
  parkDate?: Date | null;
  downtimePoints?: number;
  missivePoints?: number;
}

export interface CreateCharacterData extends UpdateCharacterData {
  campaignId: number;
  userId: string;
  name: string;
}

// Accetta `PrismaTransactionClient` (non solo `PrismaClient`, T-018): la route di
// creazione PG con catalogo crea il `Character` nella stessa transazione
// Prisma del grant XP iniziale e delle assegnazioni (`characterData.service`),
// non una transazione separata.
export async function createCharacter(
  prisma: PrismaTransactionClient,
  data: CreateCharacterData
) {
  // Un PNG è creato e gestito direttamente dallo staff: nasce già approvato
  // (`approvalDate` valorizzata → status derivato "approved", vedi
  // `getCharacterStatus`), senza passare per lo stato "in revisione" né per
  // l'approvazione manuale che serve invece ai PG. Non sovrascrive un
  // `approvalDate` esplicito già presente nel payload.
  const approvalDate =
    data.approvalDate === undefined && data.type === CharacterType.png
      ? new Date()
      : data.approvalDate;

  return prisma.character.create({
    data: { ...data, approvalDate },
    include: {
      campaign: {
        select: {
          name: true,
          slug: true,
          organization: { select: { slug: true } },
        },
      },
      user: { select: { name: true } },
    },
  });
}

// Accetta `PrismaTransactionClient` (T-050): `PUT /api/characters/[id]`
// aggiorna il personaggio nella stessa transazione della notifica di
// cambio-stato, mirror dello schema già usato da `createCharacter`.
export async function updateCharacter(
  prisma: PrismaTransactionClient,
  characterId: number,
  data: UpdateCharacterData
) {
  return prisma.character.update({
    where: { id: characterId },
    data: { ...data, lastUpdateDate: new Date() },
    include: {
      campaign: {
        select: {
          name: true,
          slug: true,
          organization: { select: { slug: true } },
        },
      },
      user: { select: { name: true } },
    },
  });
}

// Aggiustamento relativo (delta, positivo o negativo) del saldo punti
// downtime — a differenza di `updateCharacter` (che scrive un valore
// assoluto, usato dal form master della scheda), qui l'update è atomico via
// `increment` Prisma: sicuro sotto concorrenza sia per il decremento
// dell'handler `talents` sia per la ricarica bulk post-evento.
export async function adjustCharacterDowntimePoints(
  prisma: PrismaTransactionClient,
  characterId: number,
  delta: number
) {
  return prisma.character.update({
    where: { id: characterId },
    data: { downtimePoints: { increment: delta } },
  });
}

// Ricarica bulk (master, dopo un evento): incrementa il saldo punti downtime
// di ogni personaggio della campagna dello stesso importo. Restituisce il
// numero di personaggi aggiornati (`updateMany().count`).
export async function rechargeCampaignDowntimePoints(
  prisma: PrismaClient,
  campaignId: number,
  amount: number
) {
  return prisma.character.updateMany({
    where: { campaignId },
    data: { downtimePoints: { increment: amount } },
  });
}

// Aggiustamento relativo del contatore missive, mirror esatto di
// `adjustCharacterDowntimePoints` (update atomico via `increment`): usato sia
// dall'handler `missive.ts` (decremento di 1 ad ogni invio) sia dal +/-
// master in `CharacterEditor.tsx` (via `updateCharacter`, non questa
// funzione — quella scrive un valore assoluto).
export async function adjustCharacterMissivePoints(
  prisma: PrismaTransactionClient,
  characterId: number,
  delta: number
) {
  return prisma.character.update({
    where: { id: characterId },
    data: { missivePoints: { increment: delta } },
  });
}

// Reset bulk (master, "Reset punti Missive"/"Reset punti Downtime" da
// admin/page.tsx): riporta il campo punti al massimo configurato nella
// feature (risolto dalla route chiamante) SOMMATO al bonus personale del
// personaggio (`downtimePointsBonus`/`missivePointsBonus`, accumulato dai
// talenti con `isDowntimePointBonus`/`isMissivePointBonus` — vedi
// `grantCharacterPointBonus`), per ogni personaggio *attivo* della campagna
// — stesso filtro "approved" di `getCharacterStatus` (non morto, non
// parcheggiato, approvato). Il bonus varia per personaggio, quindi non è più
// un `updateMany` a valore scalare fisso (impossibile riferire un'altra
// colonna della stessa riga in un `updateMany`): una `update` per
// personaggio, in un'unica transazione.
export async function resetCampaignPointsForActiveCharacters(
  prisma: PrismaClient,
  campaignId: number,
  field: "downtimePoints" | "missivePoints",
  value: number,
  // Bonus/malus del master (`featureData.pointBonuses`): sommati al massimale
  // del singolo personaggio; il risultato non scende mai sotto 0.
  pointBonuses: PointBonus[] = []
) {
  const characters = await prisma.character.findMany({
    where: {
      campaignId,
      deathDate: null,
      parkDate: null,
      approvalDate: { not: null },
    },
    select: { id: true, downtimePointsBonus: true, missivePointsBonus: true },
  });
  await prisma.$transaction(
    characters.map(character =>
      prisma.character.update({
        where: { id: character.id },
        data:
          field === "downtimePoints"
            ? {
                downtimePoints: Math.max(
                  0,
                  value +
                    character.downtimePointsBonus +
                    sumPointBonuses(pointBonuses, character.id)
                ),
              }
            : {
                missivePoints: Math.max(
                  0,
                  value +
                    character.missivePointsBonus +
                    sumPointBonuses(pointBonuses, character.id)
                ),
              },
      })
    )
  );
  return { count: characters.length };
}

// Side-effect di acquisizione di un talento con `isDowntimePointBonus`/
// `isMissivePointBonus` (T-0xx): +1 immediato e utilizzabile sul contatore
// E +1 sul massimale personale (`*Bonus`), così un reset campagna successivo
// non cancella il punto guadagnato — le due colonne si muovono sempre
// insieme, mai una senza l'altra.
export async function grantCharacterPointBonus(
  prisma: PrismaTransactionClient,
  characterId: number,
  field: "downtimePoints" | "missivePoints"
) {
  return prisma.character.update({
    where: { id: characterId },
    data:
      field === "downtimePoints"
        ? {
            downtimePoints: { increment: 1 },
            downtimePointsBonus: { increment: 1 },
          }
        : {
            missivePoints: { increment: 1 },
            missivePointsBonus: { increment: 1 },
          },
  });
}

// Controparte di `grantCharacterPointBonus` alla rimozione del talento:
// decrementa entrambe le colonne, mai sotto zero (il personaggio può aver
// già speso il punto, o il bonus può essere già a zero per dati storici
// incoerenti) — a differenza di `adjustCharacterDowntimePoints`/
// `adjustCharacterMissivePoints` (delta via `increment`, nessun floor), qui
// serve leggere il valore corrente prima di scrivere.
export async function revokeCharacterPointBonus(
  prisma: PrismaTransactionClient,
  characterId: number,
  field: "downtimePoints" | "missivePoints"
) {
  const character = await prisma.character.findUniqueOrThrow({
    where: { id: characterId },
    select: {
      downtimePoints: true,
      downtimePointsBonus: true,
      missivePoints: true,
      missivePointsBonus: true,
    },
  });
  return prisma.character.update({
    where: { id: characterId },
    data:
      field === "downtimePoints"
        ? {
            downtimePoints: Math.max(0, character.downtimePoints - 1),
            downtimePointsBonus: Math.max(0, character.downtimePointsBonus - 1),
          }
        : {
            missivePoints: Math.max(0, character.missivePoints - 1),
            missivePointsBonus: Math.max(0, character.missivePointsBonus - 1),
          },
  });
}

export async function getCharacterMetadataByIdScoped(
  prisma: PrismaClient,
  characterId: number,
  orgSlug: string,
  campaignSlug: string
) {
  return prisma.character.findUnique({
    where: {
      id: characterId,
      campaign: {
        slug: campaignSlug,
        organization: { slug: orgSlug },
      },
    },
    select: { name: true },
  });
}

// Eliminazione definitiva di un personaggio. Tutte le relazioni hanno
// `onDelete: Cascade` (dati, XP, booking, azioni, sblocchi) TRANNE `Message`
// (`fromId`/`toId`, `NoAction`): senza cancellare prima le missive inviate e
// ricevute, il delete fallirebbe per violazione di FK.
export async function deleteCharacter(
  prisma: PrismaClient,
  characterId: number
): Promise<Character> {
  return prisma.$transaction(async tx => {
    await tx.message.deleteMany({
      where: { OR: [{ fromId: characterId }, { toId: characterId }] },
    });
    return tx.character.delete({ where: { id: characterId } });
  });
}
