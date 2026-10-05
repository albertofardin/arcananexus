import {
  Prisma,
  type CharacterData,
  type DataType,
  type DataVisibility,
  type PrismaClient,
  type ReferenceData,
} from "@prisma/client";
import type { PrismaTransactionClient } from "./types";
import type { OwnedCharacterData } from "@/lib/visibility/types";

// Come `xpTransaction.repository.ts`: ogni funzione accetta indifferentemente
// `PrismaClient` o `Prisma.TransactionClient` come primo argomento, così il
// servizio di assegnazione (`src/lib/services/characterData.service.ts`,
// T-017) può comporle dentro la stessa `prisma.$transaction` della
// creazione + dell'addebito XP (T-025).

// `value` è `Json?`: un `null` esplicito deve mappare a `Prisma.JsonNull`
// (valore SQL NULL), non alla stringa JSON "null" — `undefined` resta "usa
// il default" (stesso pattern di `referenceData.repository.ts`).
function toJsonInput(
  value: Prisma.InputJsonValue | null | undefined
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value;
}

export interface CreateCharacterDataInput {
  characterId: number;
  referenceDataId: number;
  dataTypeId: number;
  value?: Prisma.InputJsonValue | null;
  // Non passato = lascia decidere lo schema (`@default(hidden)`, T-015); il
  // servizio di assegnazione (T-017/T-038) è il chiamante che sceglie sempre
  // un valore esplicito in base al percorso di scrittura, ma il repository
  // resta comunque in grado di ricevere `undefined` per i chiamanti diretti
  // (es. import legacy, T-024).
  visibility?: DataVisibility;
  grantedById?: string | null;
  grantedByOverride?: boolean;
  actionId?: number | null;
}

// Tutte le assegnazioni di un PG (owner polimorfo, ma qui sempre scopato al
// `characterId` — l'owner `userId` non è nello scope di T-017). Usata sia da
// `evaluateRequirements` (requisiti già posseduti) sia dal check
// `repeatable` sotto.
export async function listCharacterDataForCharacter(
  prisma: PrismaTransactionClient,
  characterId: number
): Promise<CharacterData[]> {
  return prisma.characterData.findMany({
    where: { characterId },
    orderBy: { id: "asc" },
  });
}

// Quante istanze della stessa definizione possiede già questo PG: usata dal
// guard di ripetibilità (cardinalità `multi`, T-017/T-0xx) per vietare un
// duplicato (`repeatable = false`, tetto 1) o applicare `flags.maxRepetitions`
// (`repeatable = true` con un tetto > 1).
export async function countCharacterDataByCharacterAndReferenceData(
  prisma: PrismaTransactionClient,
  characterId: number,
  referenceDataId: number
): Promise<number> {
  return prisma.characterData.count({
    where: { characterId, referenceDataId },
  });
}

export async function createCharacterData(
  prisma: PrismaTransactionClient,
  data: CreateCharacterDataInput
): Promise<CharacterData> {
  return prisma.characterData.create({
    data: {
      characterId: data.characterId,
      referenceDataId: data.referenceDataId,
      dataTypeId: data.dataTypeId,
      value: toJsonInput(data.value),
      visibility: data.visibility,
      grantedById: data.grantedById ?? null,
      grantedByOverride: data.grantedByOverride ?? false,
      actionId: data.actionId ?? null,
    },
  });
}

// Rimuove tutte le assegnazioni esistenti di un PG per un `DataType`: usata
// dalla cardinalità `single` (T-017), che sostituisce l'assegnazione
// esistente invece di accumularla. `deleteMany` (non `delete`) perché non
// c'è un vincolo unique su (characterId, dataTypeId) a schema — copre anche
// uno stato incoerente pregresso con più righe.
export async function deleteCharacterDataByDataType(
  prisma: PrismaTransactionClient,
  characterId: number,
  dataTypeId: number
): Promise<Prisma.BatchPayload> {
  return prisma.characterData.deleteMany({
    where: { characterId, dataTypeId },
  });
}

// Guard di cancellazione (T-036): conta le `CharacterData` che assegnano una
// `ReferenceData` a un PG/utente, prima di lasciarla cancellare. Le FK
// `CharacterData.referenceData`/`CharacterData.dataType` sono `onDelete:
// Cascade` a schema (voluto, resta così, vedi T-027 per lo stesso pattern sul
// grafo `DataRequirement`): senza questo pre-check una `DELETE` cancellerebbe
// in silenzio anche le assegnazioni esistenti, lasciando il PG senza quella
// voce. Un conteggio (non l'elenco delle istanze) basta alla route per
// decidere se bloccare — l'`id` passato è già scopato alla campagna dal
// chiamante, quindi nessun rischio di leak multi-tenant qui.
// Accetta `PrismaClient | Prisma.TransactionClient` (round 2, T-036): la
// route deve poter chiamarla con lo stesso `tx` della successiva `delete`,
// dentro un'unica `prisma.$transaction`, per chiudere la finestra TOCTOU tra
// il check e la cancellazione (una `CharacterData` creata concorrentemente
// nella finestra riaprirebbe il bug originale).
export async function countCharacterDataByReferenceData(
  prisma: PrismaTransactionClient,
  referenceDataId: number
): Promise<number> {
  return prisma.characterData.count({ where: { referenceDataId } });
}

// Come sopra, ma a livello di `DataType`: conta le assegnazioni di
// *qualunque* `ReferenceData` di quella categoria — la cancellazione di un
// `DataType` è bloccata non appena una sola delle sue voci ha almeno
// un'assegnazione (T-036).
// Round 2 (T-036): il filtro passa dal `dataTypeId` denormalizzato su
// `CharacterData` alla relazione autoritativa `referenceData.dataTypeId`.
// `CharacterData.referenceDataId` è obbligatorio a schema (non nullable),
// quindi ogni riga ha sempre una `ReferenceData`: il join resta corretto
// anche se il campo denormalizzato divergesse dalla relazione reale (es.
// import legacy/seed manuale), cosa che il solo filtro su `dataTypeId` non
// avrebbe coperto.
export async function countCharacterDataByDataType(
  prisma: PrismaTransactionClient,
  dataTypeId: number
): Promise<number> {
  return prisma.characterData.count({
    where: { referenceData: { dataTypeId } },
  });
}

// Repository minimale e mirato (T-020): la sezione di catalogo deve poter
// valutare la visibilità condizionale (`filterVisible`, T-026) delle voci di
// un `DataType`, che richiede le `CharacterData` possedute dal viewer
// (`VisibilityContext.ownedData`). A differenza delle funzioni sopra (T-017,
// servizio di assegnazione), questa è solo una query di lettura per questo
// consumer.
//
// `owner` scoping: un utente può possedere `CharacterData` direttamente
// (`userId`, tipico per lo staff/dati non legati a un PG) o tramite il suo
// personaggio (`characterId`) — `filterVisible` valuta entrambe le forme allo
// stesso modo (vedi `visibility/types.ts`), quindi le raccogliamo insieme.
export async function listOwnedCharacterDataInCampaign(
  prisma: PrismaClient,
  campaignId: number,
  owner: { userId: string; characterId?: number | null }
): Promise<OwnedCharacterData[]> {
  const ownerConditions: Prisma.CharacterDataWhereInput[] = [
    { userId: owner.userId },
  ];
  if (owner.characterId != null) {
    ownerConditions.push({ characterId: owner.characterId });
  }

  return prisma.characterData.findMany({
    where: {
      dataType: { campaignId },
      OR: ownerConditions,
    },
    include: { dataType: true },
  });
}

// `CharacterData` con tutte le relazioni necessarie a renderizzarla sulla
// scheda personaggio (T-034): `dataType` per il raggruppamento in sezioni,
// `referenceData` per nome/descrizione della voce assegnata (`CharacterData`
// non porta questi campi, punta alla definizione via `referenceDataId`). La
// condizione di visibilità (`visibleWith`) non è più un campo della voce ma
// un arco `DataRequirement`, risolto separatamente dal chiamante quando
// serve (vedi `characterTalents.service.ts`).
export type CharacterDataForSheet = CharacterData & {
  dataType: DataType;
  referenceData: ReferenceData;
};

// Tutte le assegnazioni di un PG specifico, con le relazioni sopra incluse:
// query di sola lettura per il consumer "scheda PG", distinta da
// `listCharacterDataForCharacter` (T-017, usata dal servizio di assegnazione
// senza relazioni) e da `listOwnedCharacterDataInCampaign` (T-020, scopata al
// viewer in tutta la campagna, non a un singolo personaggio).
//
// NB owner-scoping (nota C, T-026/T-034): questa funzione restituisce TUTTE
// le assegnazioni del PG a prescindere dalla loro `visibility` — il chiamante
// DEVE verificare che il viewer sia il proprietario del PG o dello staff
// PRIMA di invocarla (o comunque prima di esporne il risultato), perché
// `CharacterData.visibility = visible` è "visibile al proprietario", non "a
// chiunque nella campagna" (vedi `src/lib/visibility/types.ts`).
export async function listCharacterDataForCharacterWithDetails(
  prisma: PrismaClient,
  characterId: number
): Promise<CharacterDataForSheet[]> {
  return prisma.characterData.findMany({
    where: { characterId },
    orderBy: { id: "asc" },
    include: {
      dataType: true,
      referenceData: true,
    },
  });
}

// Risolve una `CharacterData` scopata sia al personaggio sia alla campagna
// (T-038): usata dalla route di "reveal" (`PATCH .../characters/[characterId]/
// data/[characterDataId]`) prima di cambiarne la `visibility`, stesso
// trattamento di `getActionByIdScoped` — un id valido ma di un altro
// personaggio/un'altra campagna è 404, senza far trapelare l'esistenza
// altrove. Lo scoping passa per `dataType.campaignId` (autoritativo, come
// `countCharacterDataByDataType` sopra) perché `CharacterData` non porta un
// `campaignId` proprio.
// `dataType`/`referenceData` inclusi (T-0xx, rimozione talento dal master
// in scheda PG): il chiamante deve sapere `dataType.kind` (per decidere se
// registrare una `XpTransaction` a 0 XP alla cancellazione, solo per i
// `talent`) e `referenceData.id`/`.name` (per quella stessa transazione) —
// prima bastava l'esistenza/scoping, qui serve anche il contenuto.
export type CharacterDataWithDefinition = CharacterData & {
  dataType: DataType;
  referenceData: ReferenceData;
};

export async function getCharacterDataByIdScoped(
  prisma: PrismaClient,
  id: number,
  characterId: number,
  campaignId: number
): Promise<CharacterDataWithDefinition | null> {
  return prisma.characterData.findFirst({
    where: { id, characterId, dataType: { campaignId } },
    include: { dataType: true, referenceData: true },
  });
}

// Rimuove una singola `CharacterData` (T-0xx, "remove" per un `DataType`
// `multi`, es. una fazione tra più possedute, o un talento posseduto): il
// chiamante deve aver già risolto e autorizzato l'istanza
// (`getCharacterDataByIdScoped` + `requireCampaignMasterBySlug`), stesso
// contratto di `updateCharacterData` sopra — qui non si ripete alcun
// controllo. Accetta `PrismaTransactionClient` (non solo `PrismaClient`,
// T-0xx): la rimozione di un talento va scritta nella stessa transazione
// dell'eventuale `XpTransaction` a 0 XP che la registra in cronologia
// (`updateXp`, `xp.service.ts`), stessa composizione già usata da
// `assignReferenceDataToCharacter`.
export async function deleteCharacterDataById(
  prisma: PrismaTransactionClient,
  id: number
): Promise<CharacterData> {
  return prisma.characterData.delete({ where: { id } });
}

export interface UpdateCharacterDataInput {
  visibility: DataVisibility;
}

// Cambia la `visibility` di una `CharacterData` già assegnata (T-038, "azione
// di reveal" del master): l'unica scrittura di questo repository che non
// crea/rimuove righe, per il campo che nessun percorso esistente cambiava mai
// dopo la creazione (vedi task file per la diagnosi). Il chiamante deve aver
// già risolto e autorizzato l'istanza (`getCharacterDataByIdScoped` +
// `requireCampaignMasterBySlug`), qui non si ripete alcun controllo.
export async function updateCharacterData(
  prisma: PrismaClient,
  id: number,
  data: UpdateCharacterDataInput
): Promise<CharacterData> {
  return prisma.characterData.update({
    where: { id },
    data: { visibility: data.visibility },
  });
}
