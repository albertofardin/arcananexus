import {
  Prisma,
  type Action,
  type Character,
  type CharacterType,
  type PrismaClient,
  type User,
} from "@prisma/client";
import { FT_MISSIVE } from "../features/featuresName";
import {
  isCommunicationMissive,
  isFreeReceiverMissive,
  isMasterTargetedReply,
  missiveActionSchema,
  type MissiveFeatureData,
} from "../features/handlers/missive";
import type { PrismaTransactionClient } from "./types";
import {
  MISSIVE_COMMUN_ID,
  MISSIVE_COMMUN_TEXT,
  MISSIVE_MASTER_ID,
  MISSIVE_MASTER_TEXT,
  type MissiveBox,
  type MissiveSenderFilter,
} from "@/lib/validations/missive";

// Re-esportata per comodità dei chiamanti (route/test) che oggi la
// importavano da qui: fonte di verità resta `validations/missive.ts` (vedi
// commento lì sul perché).
export { MISSIVE_MASTER_ID as MISSIVE_SENDER_MASTER };
export type { MissiveSenderFilter };

// Viewer per la visibilità delle missive (T-0xx): `isMaster` è deciso dal
// chiamante (le route/pagina, non questo modulo) — vero per chiunque abbia
// un ruolo di campagna (supporter/helper, master, head_master, tramite
// `isUserCampaignHelper`) o sia super-admin, che vede così tutte le missive
// della campagna senza filtro di appartenenza; un giocatore senza alcun
// ruolo vede solo le missive inviate DAI propri PG (`characterId`) o
// ricevute DA uno di essi — "ricevute" è un match per id
// (`actionData.receiverCharacterId` uguale a uno dei propri
// `characterIds`), stessi id usati anche per il lato mittente.
// `hasActiveCharacter` (T-0xx, missive Comunicazione, regola prodotto
// aggiornata): `true` se il viewer possiede ALMENO UN personaggio — PG O PNG
// indifferentemente, non solo PG come nella versione precedente della
// regola — con `getCharacterStatus(character) === "approved"`, calcolato dal
// CHIAMANTE (le route, che hanno già `listUserCharacters` sotto mano), mai
// da questo repository, che non deve fare una query aggiuntiva solo per
// derivarlo. Una Comunicazione è visibilità DINAMICA (stato attuale dei
// personaggi del viewer), non uno snapshot preso all'invio: un personaggio
// che muore/va in pausa dopo l'invio perde la visibilità sulle Comunicazioni
// già inviate se non ha altri personaggi attivi. Esiste SOLO sul ramo
// giocatore (`isMaster: false`): per un master la Comunicazione è sempre
// visibile in "Posta in arrivo", vedi sotto — il campo sarebbe morto.
// `ownCharacterIds` (T-0xx, tab "Posta in arrivo"/"Inviate", vedi
// `buildBoxWhere` sotto): un master/head_master/supporter/super-admin PUÒ
// possedere anche un PG reale nella stessa campagna (es. il super-admin che
// gioca un proprio personaggio) — `isMaster: true` da solo non basta per
// decidere la direzione di una missiva scritta da quel PG, serve sapere
// quali `characterId` sono "propri" anche per un viewer master. Array vuoto
// per la stragrande maggioranza dei master (nessun PG proprio in questa
// campagna): nessuna differenza rispetto al comportamento precedente, vedi
// `buildBoxWhere`. Non serve a `buildVisibilityWhere` (un master non ha
// alcun filtro di visibilità aggiuntivo, vede già tutto).
// `userId` (T-0xx, stesso motivo: due master diversi che scrivono entrambi
// "a nome del master" allo stesso PG NON devono vedersi a vicenda le
// missive in "Inviate" — serve l'id dell'utente master che sta guardando
// per confrontarlo con `Action.authorUserId`, vedi `buildBoxWhere` e
// `resolveMasterSenderName` sotto).
// Un master vede SEMPRE la Comunicazione nella propria "Posta in arrivo"
// (T-0xx, regola prodotto aggiornata: nessun gate su personaggi attivi, a
// differenza della versione precedente) — è staff di campagna
// (master/head_master/supporter/super-admin), non un privilegio legato al
// possesso di un personaggio: vale sia che abbia un proprio PG/PNG attivo
// sia che non ne abbia alcuno. Per questo il ramo `isMaster: true` non porta
// più `hasActiveCharacter` (vedi `buildBoxWhere`) — la vede comunque anche
// in "Tutte le missive" (`buildVisibilityWhere` per un master resta `{}`,
// incondizionato, invariato).
export type MissiveViewer =
  | { isMaster: true; ownCharacterIds: number[]; userId: string }
  | { isMaster: false; characterIds: number[]; hasActiveCharacter: boolean };

export interface ListMissivesFilters {
  senderCharacterId?: MissiveSenderFilter;
  receiverCharacterId?: number;
  dateFrom?: Date;
  dateTo?: Date;
  // Match case-insensitive su oggetto/nome PG mittente/nome giocatore
  // mittente, applicato in memoria (vedi `matchesSearch` sotto) — non a
  // livello SQL, perché `subject`/`description` vivono dentro `actionData`
  // (Json) e il nome giocatore richiede una join (`character.user.name`).
  search?: string;
  // Tab "Posta in arrivo"/"Inviate" (vedi `buildBoxWhere` sotto).
  // `undefined` = nessun filtro (usato oggi solo per il calcolo delle
  // opzioni filtro, `buildVisibleWhere`, mai per la lista vera e propria).
  box?: MissiveBox;
}

export interface ListMissivesOptions {
  campaignId: number;
  viewer: MissiveViewer;
  filters?: ListMissivesFilters;
  page: number;
  pageSize: number;
}

// Riga grezza come tornata da Prisma (include il mittente, non ancora
// arricchita col destinatario risolto): il mittente (`character`) è `null`
// per le missive "a nome del master". `author` (T-0xx): risolto in JOIN da
// `Action.authorUserId` — `null` per ogni riga che non è una missiva reale/
// "Campo libero" "a nome del master" (PG reale, Comunicazione, o record
// legacy scritti prima dell'introduzione del campo).
type MissiveActionRow = Action & {
  character:
    | (Pick<Character, "id" | "name" | "avatar"> & {
        user: Pick<User, "name">;
      })
    | null;
  author: Pick<User, "name"> | null;
};

// Shape usata sia dalla lista sia dal dettaglio: `receiver` è `null` se
// `actionData.receiverCharacterId` non risolve più a nessun Character
// della campagna (personaggio eliminato dopo l'invio — `receiverCharacterId`
// non è una vera FK Prisma con `onDelete cascade`, quindi il caso è possibile
// anche se non risultano occorrenze oggi). `readDate` è `null` finché il
// destinatario non apre la missiva (`markMissiveAsRead` sotto). `sendDate` è
// un mapping esposto sulla colonna Prisma reale `creationDate` (mai
// rinominata a livello di schema/query, vedi `orderBy`/`buildDateWhere`
// sotto): il rename vale solo per l'oggetto restituito da questo repository.
export type MissiveWithSender = Omit<MissiveActionRow, "creationDate"> & {
  receiver: MissiveReceiverDetail | null;
  readDate: Date | null;
  sendDate: Date;
  // `true` per una missiva Comunicazione (`actionData.communication`): il
  // client deve controllarlo PRIMA di interpretare `receiver === null` come
  // "personaggio eliminato" (vedi `resolveReceiver` sotto).
  isCommunication: boolean;
  // `true` per una missiva "Campo libero" (`actionData.receiverFreeText`):
  // stesso principio di `isCommunication` — il client deve controllarlo
  // PRIMA di interpretare `receiver === null` come "personaggio eliminato",
  // qui `receiver` è sempre `null` perché non c'è mai stato un `Character`
  // destinatario (vedi `resolveReceiver` sotto).
  isFreeReceiver: boolean;
  // `true` per una risposta di un PG rivolta al master (`actionData.
  // receiverUserId`, T-0xx missive "a nome del master" rispondibili): come
  // `isFreeReceiver`, il client deve controllarlo PRIMA di interpretare
  // `receiver === null` come "personaggio eliminato" — qui `receiver` è
  // sempre `null` perché non c'è mai stato un `Character` destinatario (il
  // destinatario è l'utente master, mai esposto come tale al giocatore, vedi
  // CLAUDE.md "Visibilità server-side").
  isMasterReceiver: boolean;
  // Testo libero del destinatario (`actionData.receiverFreeText`), `null`
  // per le altre due varianti — vedi `resolveFreeReceiverText` sotto.
  receiverFreeText: string | null;
  // Popolato SOLO quando il viewer è master e la riga è una comunicazione
  // (vedi `resolveReadByCharacters`) — vuoto per le missive normali E per
  // un viewer non-master, mai filtrato lato client.
  readByCharacters: MissiveReceiverDetail[];
  // Username del master autore di una missiva "a nome del master" (T-0xx):
  // popolato SOLO quando il viewer è master, la riga non è una
  // Comunicazione, e `row.author` risolve a qualcosa — SEMPRE `null` per un
  // viewer non-master (enforcement server-side, vedi CLAUDE.md "Visibilità
  // server-side": nessun dato sull'autore reale di una missiva "a nome del
  // master" deve mai arrivare a un giocatore). Vedi `resolveMasterSenderName`.
  masterSenderName: string | null;
  // `true` se questa riga È una risposta di un thread (`actionData.
  // threadRootId` presente, T-0xx "risposte alle missive") — mai vero per
  // Comunicazione/"a nome del master"/"Campo libero", il thread esiste solo
  // nel ramo reale (vedi `missiveActionSchema.threadRootId` in
  // `handlers/missive.ts`). `threadRootId` è l'id della missiva radice,
  // `null` sulla radice stessa. Il chiamante (page di dettaglio) usa
  // `isReply`/`threadRootId` per redirigere sempre all'URL canonico della
  // radice, mai a quello di una singola risposta.
  isReply: boolean;
  threadRootId: number | null;
};

export interface MissiveSenderOption {
  id: MissiveSenderFilter;
  name: string;
  avatar: string | null;
}

export interface MissiveReceiverOption {
  id: number;
  name: string;
  avatar: string | null;
  type: CharacterType;
}

// Receiver risolto per-missiva (dettaglio/lista, distinto dalle opzioni
// filtro sopra: `MissiveReceiverOption`, che restano invariate): arricchito
// con `userName` (nome del giocatore proprietario), stesso pattern del
// mittente (`missive.character.user.name`).
export interface MissiveReceiverDetail {
  id: number;
  name: string;
  avatar: string | null;
  userName: string;
  type: CharacterType;
}

export interface MissiveFilterOptions {
  senders: MissiveSenderOption[];
  receivers: MissiveReceiverOption[];
}

export interface MissivePagination {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface ListMissivesResult {
  missives: MissiveWithSender[];
  filterOptions: MissiveFilterOptions;
  pagination: MissivePagination;
}

// Filtro di visibilità (enforced qui, non lato client — vedi CLAUDE.md
// "Visibilità server-side"): un master non ha alcun filtro aggiuntivo; un
// giocatore vede solo `characterId in characterIds` OR
// `actionData.receiverCharacterId` uguale a uno dei propri
// `characterIds` — stessi id sia per il lato mittente sia per il lato
// destinatario, nessun match testuale. Se il giocatore non ha alcun PG,
// l'OR sarebbe vuoto — che Prisma tratterebbe come "nessuna condizione"
// (quindi via libera a TUTTO): il sentinel `{ id: -1 }` sotto chiude
// esplicitamente questo caso a "nessuna missiva visibile".
function buildVisibilityWhere(viewer: MissiveViewer): Prisma.ActionWhereInput {
  // `=== true` esplicito, non solo `if (viewer.isMaster)`: con
  // `strictNullChecks: false` (tsconfig di progetto) il narrowing su un
  // discriminated union dopo un early return funziona in modo affidabile
  // solo con il confronto esplicito — verificato empiricamente (`tsc`
  // continua a vedere `viewer` come l'intera union sotto, altrimenti).
  if (viewer.isMaster === true) return {};

  const conditions: Prisma.ActionWhereInput[] = [];
  if (viewer.characterIds.length > 0) {
    conditions.push({ characterId: { in: viewer.characterIds } });
  }
  for (const id of viewer.characterIds) {
    conditions.push({
      actionData: { path: ["receiverCharacterId"], equals: id },
    });
  }
  // Comunicazione (T-0xx): visibile a chiunque abbia ALMENO UN personaggio
  // attivo, PG o PNG indifferentemente (regola prodotto aggiornata) — non un
  // match per id come sopra, quindi una condizione unica invece che una per
  // `characterId`.
  if (viewer.hasActiveCharacter) {
    conditions.push({ actionData: { path: ["communication"], equals: true } });
  }

  return { OR: conditions.length > 0 ? conditions : [{ id: -1 }] };
}

function buildSenderWhere(
  senderCharacterId: MissiveSenderFilter | undefined
): Prisma.ActionWhereInput {
  if (senderCharacterId === undefined) return {};
  if (senderCharacterId === MISSIVE_MASTER_ID) {
    // NON `NOT: { actionData: { path: ["communication"], equals: true } } }`
    // (bug reale pre-esistente, trovato e verificato contro Postgres
    // mentre si indagava lo stesso pattern in `buildBoxWhere` sotto): la
    // maggior parte delle righe non ha affatto la chiave `communication`
    // nel JSON, quindi `NOT (NULL = true)` è NULL (semantica a tre valori),
    // non `true` — il filtro "Mittente = Master" restava sempre vuoto, mai
    // un solo risultato, anche con missive "a nome del master" reali da
    // includere. Stesso fix: `not: Prisma.DbNull` è NULL-safe (verificato
    // empiricamente).
    return {
      characterId: null,
      NOT: {
        actionData: { path: ["communication"], not: Prisma.DbNull },
      },
    };
  }
  if (senderCharacterId === MISSIVE_COMMUN_ID) {
    return {
      characterId: null,
      actionData: { path: ["communication"], equals: true },
    };
  }
  return { characterId: senderCharacterId };
}

function buildReceiverWhere(
  receiverCharacterId?: number
): Prisma.ActionWhereInput {
  if (receiverCharacterId === undefined) return {};
  return {
    actionData: {
      path: ["receiverCharacterId"],
      equals: receiverCharacterId,
    },
  };
}

// Tab "Posta in arrivo"/"Inviate"/"Tutte le missive" (T-0xx, stile Gmail).
//
// Una Comunicazione sta SEMPRE in "Posta in arrivo", per QUALSIASI viewer
// (incluso un master che l'ha scritta lui stesso "a nome del master"): è un
// annuncio broadcast, non qualcosa che l'autore ha "inviato a qualcuno" nel
// senso Gmail del termine — non compare mai in "Inviate", nemmeno per il
// master.
//
// Per un GIOCATORE l'asse resta CHI HA SCRITTO la missiva (`characterId`)
// rispetto al viewer: "Inviate" è `characterId` uno dei propri
// `characterIds`; "Posta in arrivo" è tutto il resto visibile (ricevute da
// un proprio PG O Comunicazioni — queste ultime hanno sempre
// `characterId: null`, mai tra i propri `characterIds`, quindi ricadono già
// naturalmente nel "resto" senza bisogno di un caso speciale).
//
// Per un MASTER l'asse è diverso e dipende dalla tab: "Posta in arrivo" è
// CHI RICEVE (`actionData.receiverCharacterId` uno dei propri
// `ownCharacterIds`) OPPURE una Comunicazione (sempre) — un master PUÒ
// possedere un PG reale nella stessa campagna (es. un super-admin che gioca
// un proprio personaggio, bug reale osservato in produzione), e la sua
// inbox è "roba indirizzata a me personalmente", non "tutto ciò che non ho
// scritto io" (quest'ultimo insieme, che include anche il traffico fra
// ALTRI giocatori, vive nella terza tab "Tutte le missive", non in
// "Posta in arrivo"). "Inviate" per un master resta CHI HA SCRITTO
// (`characterId` uno dei propri `ownCharacterIds` OPPURE `characterId: null`
// "a nome del master"), ma esclude esplicitamente la Comunicazione (che sta
// sempre in "Posta in arrivo", vedi sopra) — E, per il ramo "a nome del
// master", si restringe al viewer STESSO (`authorUserId === viewer.userId`):
// due master diversi (es. Marco e Pippo) che scrivono entrambi "a nome del
// master" allo stesso PG non devono vedersi a vicenda le missive
// nell'"Inviate" reciproco (scenario reale segnalato dall'utente), ognuno
// vede solo la propria. Entrambe restano comunque visibili a entrambi in
// "Tutte le missive" (nessun filtro di direzione), con l'autore specifico
// esposto via `masterSenderName` (mai al giocatore destinatario, vedi
// `resolveMasterSenderName`).
//
// "Tutte le missive" (`box === "all"`, master-only in UI — la route non
// impedisce a un giocatore di passarlo, ma `buildVisibilityWhere` per un
// giocatore limita comunque l'insieme all'appartenenza propria, quindi non
// c'è nulla da "vedere in più" per lui) rimuove ogni filtro di direzione:
// stesso trattamento di `box === undefined`.
function buildBoxWhere(
  box: MissiveBox | undefined,
  viewer: MissiveViewer
): Prisma.ActionWhereInput {
  if (box === undefined || box === "all") return {};

  // `=== true` esplicito, stesso motivo di `buildVisibilityWhere` sopra
  // (narrowing affidabile su un discriminated union con
  // `strictNullChecks: false`).
  if (box === "sent") {
    if (viewer.isMaster === true) {
      // Un `in` con `ownCharacterIds` vuoto (la stragrande maggioranza dei
      // master) non aggiunge match: nessuna regressione per quel caso.
      //
      // NON `NOT: { actionData: { path: ["communication"], equals: true } } }`
      // (bug reale trovato verificando contro Postgres, non solo contro i
      // mock nei test): la maggior parte delle righe non ha affatto la
      // chiave `communication` nel JSON, quindi `actionData->>'communication'`
      // risolve a SQL NULL — `NOT (NULL = true)` è NULL (semantica a tre
      // valori), non `true`, e la riga viene esclusa dalla `WHERE` invece di
      // combaciare. Risultato osservato: la tab "Inviate" di un master
      // restava sempre vuota, anche con missive reali da includere.
      // `not: Prisma.DbNull` genera invece un confronto NULL-safe
      // (`IS [NOT] NULL`, mai propagante) — usato qui per verificare
      // l'ASSENZA della chiave, poi negato con un `NOT` esterno: il
      // risultato finale ("non è una Comunicazione") è deterministico anche
      // per le righe senza quella chiave, verificato empiricamente.
      // `authorUserId: viewer.userId` (T-0xx, scenario Marco/Pippo):
      // restringe il ramo "a nome del master" al viewer stesso — senza
      // questo, due master diversi che scrivono entrambi "a nome del
      // master" allo stesso PG si vedrebbero a vicenda le rispettive
      // missive in "Inviate".
      return {
        OR: [
          {
            characterId: null,
            authorUserId: viewer.userId,
            NOT: {
              actionData: { path: ["communication"], not: Prisma.DbNull },
            },
          },
          { characterId: { in: viewer.ownCharacterIds } },
        ],
      };
    }
    return { characterId: { in: viewer.characterIds } };
  }

  // box === "inbox"
  if (viewer.isMaster === true) {
    // Asse CHI RICEVE, non CHI SCRIVE: la condizione Comunicazione è SEMPRE
    // presente (regola prodotto aggiornata, T-0xx — non più condizionata a
    // un PG/PNG attivo del master: uno staff di campagna vede sempre gli
    // annunci broadcast nella propria "Posta in arrivo", che possieda o no
    // un personaggio in questa campagna), più una per ciascun personaggio
    // proprio come destinatario. L'array non è mai vuoto (contiene sempre
    // almeno la condizione Comunicazione): a differenza del ramo giocatore
    // in `buildVisibilityWhere`, qui non serve il sentinel `{ id: -1 }` per
    // il caso "nessun filtro" di un `OR: []` — quel caso non può più
    // verificarsi.
    const conditions: Prisma.ActionWhereInput[] = [
      { actionData: { path: ["communication"], equals: true } },
      ...viewer.ownCharacterIds.map((id): Prisma.ActionWhereInput => ({
        actionData: { path: ["receiverCharacterId"], equals: id },
      })),
    ];
    return { OR: conditions };
  }
  // NON `NOT: { characterId: { in: viewer.characterIds } } }`/
  // `characterId: { notIn: ... } }`: la semantica NULL a tre valori di SQL
  // fa sì che `characterId <> ...`/`NOT IN (...)` non combaci MAI con una
  // riga a `characterId NULL` (una Comunicazione o una missiva "a nome del
  // master"), escludendola per errore dall'"inbox" invece di includerla —
  // verificato empiricamente contro Postgres, non solo teoria. L'OR
  // esplicito va innestato sotto `AND` (non un `OR` top-level) per non
  // sovrascrivere quello di `buildVisibilityWhere` quando i due vengono
  // spalmati nello stesso `where` (stessa chiave, l'ultimo spread vince).
  return {
    AND: [
      {
        OR: [
          { characterId: null },
          { characterId: { notIn: viewer.characterIds } },
        ],
      },
    ],
  };
}

function buildDateWhere(
  dateFrom?: Date,
  dateTo?: Date
): Prisma.ActionWhereInput {
  if (!dateFrom && !dateTo) return {};
  return {
    creationDate: {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    },
  };
}

// Base comune a lista/dettaglio/opzioni filtro: sempre scopata alla
// `Feature` "missive" della campagna (`FT_MISSIVE`), più la visibilità del
// viewer. I filtri strutturali (mittente/destinatario/date) si aggiungono
// solo per la lista vera e propria, MAI per il calcolo delle opzioni filtro
// (che deve restare stabile mentre l'utente filtra, vedi
// `listMissivesForCampaign` sotto).
function buildVisibleWhere(
  campaignId: number,
  viewer: MissiveViewer
): Prisma.ActionWhereInput {
  return {
    feature: { campaignId, featureType: { functionName: FT_MISSIVE } },
    ...buildVisibilityWhere(viewer),
  };
}

const missiveSenderInclude = {
  character: {
    select: {
      id: true,
      name: true,
      avatar: true,
      user: { select: { name: true } },
    },
  },
  // Autore reale "a nome del master" (T-0xx): risolto in JOIN, stesso
  // pattern di `character` — nessuna query separata né mappa manuale.
  author: { select: { name: true } },
} as const;

function matchesSearch(missive: MissiveActionRow, search: string): boolean {
  const actionData = missive.actionData as { subject?: string } | null;
  const haystack = [
    actionData?.subject,
    missive.character?.name,
    missive.character?.user.name,
  ]
    .filter((value): value is string => !!value)
    .map(value => value.toLowerCase());

  return haystack.some(value => value.includes(search));
}

interface FilterOptionRow {
  actionData: Prisma.JsonValue;
  character: { id: number; name: string; avatar: string | null } | null;
}

type CharactersById = Map<
  number,
  { name: string; avatar: string | null; userName: string; type: CharacterType }
>;

// Legge `actionData.receiverCharacterId` e risolve il Character
// corrente (nome/avatar/tipo possono essere cambiati rispetto a quando la
// missiva è stata inviata — si mostra sempre lo stato attuale; il tipo non
// è mai letto da `actionData`, vedi il commento su `missiveActionSchema` in
// `handlers/missive.ts`). `null` se il campo manca (non dovrebbe più
// succedere, backfill completato) o se l'id non risolve più a nessun
// Character della campagna (eliminato) — una missiva Comunicazione non ha
// mai questa chiave, quindi risolve a `null` qui senza bisogno di un
// controllo esplicito: il client distingue i due casi tramite
// `MissiveWithSender.isCommunication`, mai da `receiver === null` da solo.
function resolveReceiver(
  actionData: Prisma.JsonValue,
  charactersById: CharactersById
): MissiveReceiverDetail | null {
  const id = (actionData as { receiverCharacterId?: number } | null)
    ?.receiverCharacterId;
  if (id === undefined) return null;

  const character = charactersById.get(id);
  if (!character) return null;

  return {
    id,
    name: character.name,
    avatar: character.avatar,
    userName: character.userName,
    type: character.type,
  };
}

// Legge `actionData.receiverFreeText` (missiva "Campo libero"): nessun
// lookup, a differenza di `resolveReceiver` — è già il valore finale da
// mostrare, non un id da risolvere contro un `Character`. `null` per le
// altre due varianti (ramo reale/Comunicazione, che non hanno mai questa
// chiave).
function resolveFreeReceiverText(actionData: Prisma.JsonValue): string | null {
  const value = (actionData as { receiverFreeText?: string } | null)
    ?.receiverFreeText;
  return value ?? null;
}

// Legge `actionData.threadRootId` senza ri-validare con Zod, stesso pattern
// di `isCommunicationMissive`/`isFreeReceiverMissive`: presente SOLO su un
// messaggio di risposta (mai sulla missiva radice), quindi basta un
// controllo di tipo — `null` per ogni altra riga (radice reale,
// Comunicazione, "Campo libero", "a nome del master").
function resolveThreadRootId(actionData: Prisma.JsonValue): number | null {
  const value = (actionData as { threadRootId?: number } | null)?.threadRootId;
  return typeof value === "number" ? value : null;
}

// Username del master autore di una missiva "a nome del master" (T-0xx,
// scenario Marco/Pippo): visibile SOLO a un viewer master, MAI a un
// giocatore — enforcement server-side, non un filtro lato client. Esclude
// esplicitamente la Comunicazione via `isCommunicationMissive` (non solo
// per assenza di `row.author`, che oggi è comunque sempre `null` per una
// Comunicazione perché `createCommunicationMissiveAction` non valorizza
// `authorUserId` — ma l'esclusione esplicita resta corretta anche se in
// futuro decidessimo di tracciarlo pure lì, vedi il commento su
// `createMasterMissiveAction`). `null` anche per un record scritto prima
// dell'introduzione di `authorUserId` (nessun backfill, `row.author` risolve
// a `null`).
function resolveMasterSenderName(
  row: MissiveActionRow,
  viewer: MissiveViewer
): string | null {
  if (viewer.isMaster !== true) return null;
  if (isCommunicationMissive(row.actionData)) return null;
  return row.author?.name ?? null;
}

// Legge `actionData.readDate` (stringa ISO salvata da `markMissiveAsRead`) —
// a differenza di `resolveReceiver` non serve alcun lookup: non arriva mai
// stale, il valore è già quello finale.
// Per una Comunicazione non c'è un singolo destinatario, quindi "letta" è
// relativo AL VIEWER corrente: un giocatore la vede "letta" se uno dei SUOI
// PG è in `readByCharacterIds`. Un master con almeno un proprio personaggio
// nella campagna segue la STESSA regola personale (non basta che l'abbia
// aperta un giocatore qualsiasi) — un master SENZA alcun personaggio non ha
// invece alcun modo personale di comparire in `readByCharacterIds` (la
// route richiede un personaggio attivo per segnare una Comunicazione come
// letta), quindi per lui resta l'aggregato "letta da almeno qualcuno" come
// unico segnale utile disponibile. Non abbiamo un timestamp per-PG (solo
// l'appartenenza all'array): `sendDate` è usato come placeholder stabile —
// non è il vero istante di lettura, ma evita di inventare una precisione
// (es. "adesso") che non esiste.
function resolveReadDate(
  actionData: Prisma.JsonValue,
  viewer: MissiveViewer,
  sendDate: Date
): Date | null {
  if (isCommunicationMissive(actionData)) {
    const readByCharacterIds =
      (actionData as { readByCharacterIds?: number[] } | null)
        ?.readByCharacterIds ?? [];
    const isRead =
      viewer.isMaster === true
        ? viewer.ownCharacterIds.length > 0
          ? viewer.ownCharacterIds.some(id => readByCharacterIds.includes(id))
          : readByCharacterIds.length > 0
        : viewer.characterIds.some(id => readByCharacterIds.includes(id));
    return isRead ? sendDate : null;
  }

  const data = actionData as { readDate?: string | null } | null;
  return data?.readDate ? new Date(data.readDate) : null;
}

// Elenco dei PG che hanno letto una Comunicazione (T-0xx): popolato SOLO
// quando il viewer è master (`MissiveWithSender.readByCharacters`) — un
// giocatore non deve vedere chi altro ha letto, enforcement server-side
// (mai filtrato lato client, vedi CLAUDE.md "Visibilità server-side").
// Risolve gli id di `actionData.readByCharacterIds` contro la stessa
// `charactersById` map già costruita per il destinatario: un id che non
// risolve più (personaggio eliminato) viene scartato in silenzio, stesso
// trattamento delle opzioni filtro (`buildFilterOptions`).
function resolveReadByCharacters(
  actionData: Prisma.JsonValue,
  viewer: MissiveViewer,
  charactersById: CharactersById
): MissiveReceiverDetail[] {
  if (viewer.isMaster !== true) return [];
  if (!isCommunicationMissive(actionData)) return [];

  const ids =
    (actionData as { readByCharacterIds?: number[] } | null)
      ?.readByCharacterIds ?? [];

  return ids
    .map((id): MissiveReceiverDetail | null => {
      const character = charactersById.get(id);
      return character
        ? {
            id,
            name: character.name,
            avatar: character.avatar,
            userName: character.userName,
            type: character.type,
          }
        : null;
    })
    .filter(
      (character): character is MissiveReceiverDetail => character !== null
    );
}

// Opzioni disponibili per i `FieldSelect` "Mittente"/"Destinatario"
// (T-0xx): calcolate sull'insieme visibile AL VIEWER, ignorando gli altri
// filtri applicati in quel momento — così le select non si svuotano/
// riordinano mentre l'utente affina la ricerca. `charactersById` risolve
// nome/avatar da `actionData.receiverCharacterId`: id che non risolvono
// più a nessun Character (personaggio eliminato) vengono scartati in
// silenzio dalle opzioni filtro.
function buildFilterOptions(
  rows: FilterOptionRow[],
  charactersById: CharactersById
): MissiveFilterOptions {
  const sendersById = new Map<number, MissiveSenderOption>();
  let hasMasterSender = false;
  let hasCommunicationSender = false;
  const receiverIds = new Set<number>();

  for (const row of rows) {
    if (row.character) {
      sendersById.set(row.character.id, {
        id: row.character.id,
        name: row.character.name,
        avatar: row.character.avatar,
      });
    } else if (isCommunicationMissive(row.actionData)) {
      hasCommunicationSender = true;
    } else {
      hasMasterSender = true;
    }

    const receiverCharacterId = (
      row.actionData as { receiverCharacterId?: number } | null
    )?.receiverCharacterId;
    if (receiverCharacterId !== undefined) {
      receiverIds.add(receiverCharacterId);
    }
  }

  const senders = Array.from(sendersById.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "it")
  );
  if (hasMasterSender) {
    senders.push({
      id: MISSIVE_MASTER_ID,
      name: MISSIVE_MASTER_TEXT,
      avatar: null,
    });
  }
  if (hasCommunicationSender) {
    senders.push({
      id: MISSIVE_COMMUN_ID,
      name: MISSIVE_COMMUN_TEXT,
      avatar: null,
    });
  }

  const receivers = Array.from(receiverIds)
    .map((id): MissiveReceiverOption | null => {
      const character = charactersById.get(id);
      return character
        ? {
            id,
            name: character.name,
            avatar: character.avatar,
            type: character.type,
          }
        : null;
    })
    .filter((option): option is MissiveReceiverOption => option !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "it"));

  return { senders, receivers };
}

// Lista delle missive visibili al viewer (T-0xx): filtri strutturali
// (mittente/destinatario/date) applicati a livello Prisma, `search` in
// memoria (vedi `ListMissivesFilters.search`) — scelta di semplicità
// deliberata, non ottimizzata oltre. La paginazione (`page`/`pageSize`)
// si applica DOPO il filtro `search`, sullo stesso array in memoria — non
// un `skip`/`take` a livello Prisma, altrimenti taglierebbe le righe prima
// che `search` le abbia potute escludere/includere, producendo pagine
// incomplete o con conteggi sbagliati. Le opzioni filtro sono una query
// separata e più leggera sullo stesso `where` di visibilità (senza i filtri
// strutturali, MAI paginata): vedi `buildFilterOptions`.
export async function listMissivesForCampaign(
  prisma: PrismaClient,
  { campaignId, viewer, filters = {}, page, pageSize }: ListMissivesOptions
): Promise<ListMissivesResult> {
  const visibleWhere = buildVisibleWhere(campaignId, viewer);

  const where: Prisma.ActionWhereInput = {
    ...visibleWhere,
    ...buildSenderWhere(filters.senderCharacterId),
    ...buildReceiverWhere(filters.receiverCharacterId),
    ...buildDateWhere(filters.dateFrom, filters.dateTo),
    ...buildBoxWhere(filters.box, viewer),
  };

  const [rows, optionRows, campaignCharacters] = await Promise.all([
    prisma.action.findMany({
      where,
      include: missiveSenderInclude,
      orderBy: { creationDate: "desc" },
    }),
    prisma.action.findMany({
      where: visibleWhere,
      select: {
        actionData: true,
        character: { select: { id: true, name: true, avatar: true } },
      },
    }),
    prisma.character.findMany({
      where: { campaignId },
      select: {
        id: true,
        name: true,
        avatar: true,
        type: true,
        user: { select: { name: true } },
      },
    }),
  ]);

  const charactersById: CharactersById = new Map(
    (campaignCharacters ?? []).map(character => [
      character.id,
      {
        name: character.name,
        avatar: character.avatar,
        userName: character.user.name,
        type: character.type,
      },
    ])
  );

  const search = filters.search?.trim().toLowerCase();
  const filteredRows = search
    ? rows.filter(row => matchesSearch(row, search))
    : rows;

  const totalCount = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const start = (page - 1) * pageSize;
  const pageRows = filteredRows.slice(start, start + pageSize);

  const missives: MissiveWithSender[] = pageRows.map(row => {
    const { creationDate, ...rest } = row;
    return {
      ...rest,
      sendDate: creationDate,
      receiver: resolveReceiver(row.actionData, charactersById),
      readDate: resolveReadDate(row.actionData, viewer, creationDate),
      isCommunication: isCommunicationMissive(row.actionData),
      isFreeReceiver: isFreeReceiverMissive(row.actionData),
      isMasterReceiver: isMasterTargetedReply(row.actionData),
      receiverFreeText: resolveFreeReceiverText(row.actionData),
      readByCharacters: resolveReadByCharacters(
        row.actionData,
        viewer,
        charactersById
      ),
      masterSenderName: resolveMasterSenderName(row, viewer),
      isReply: resolveThreadRootId(row.actionData) !== null,
      threadRootId: resolveThreadRootId(row.actionData),
    };
  });

  return {
    missives,
    filterOptions: buildFilterOptions(optionRows, charactersById),
    pagination: { page, pageSize, totalCount, totalPages },
  };
}

export interface GetMissiveOptions {
  campaignId: number;
  actionId: number;
  viewer: MissiveViewer;
}

// Risoluzione scopata di una singola missiva (T-0xx): stessa logica di
// visibilità di `listMissivesForCampaign`, applicata a un solo record.
// Ritorna sempre `null` (mai un errore diverso) se non trovata o non
// visibile al viewer — non deve rivelare l'esistenza di una missiva non
// visibile, stesso trattamento di `getActionByIdScoped`.
export async function getMissiveByIdScoped(
  prisma: PrismaClient,
  { campaignId, actionId, viewer }: GetMissiveOptions
): Promise<MissiveWithSender | null> {
  const missive = await prisma.action.findFirst({
    where: { id: actionId, ...buildVisibleWhere(campaignId, viewer) },
    include: missiveSenderInclude,
  });
  if (!missive) return null;

  const campaignCharacters = await prisma.character.findMany({
    where: { campaignId },
    select: {
      id: true,
      name: true,
      avatar: true,
      type: true,
      user: { select: { name: true } },
    },
  });
  const charactersById: CharactersById = new Map(
    (campaignCharacters ?? []).map(character => [
      character.id,
      {
        name: character.name,
        avatar: character.avatar,
        userName: character.user.name,
        type: character.type,
      },
    ])
  );

  const { creationDate, ...rest } = missive;
  return {
    ...rest,
    sendDate: creationDate,
    receiver: resolveReceiver(missive.actionData, charactersById),
    readDate: resolveReadDate(missive.actionData, viewer, creationDate),
    isCommunication: isCommunicationMissive(missive.actionData),
    isFreeReceiver: isFreeReceiverMissive(missive.actionData),
    isMasterReceiver: isMasterTargetedReply(missive.actionData),
    receiverFreeText: resolveFreeReceiverText(missive.actionData),
    readByCharacters: resolveReadByCharacters(
      missive.actionData,
      viewer,
      charactersById
    ),
    masterSenderName: resolveMasterSenderName(missive, viewer),
    isReply: resolveThreadRootId(missive.actionData) !== null,
    threadRootId: resolveThreadRootId(missive.actionData),
  };
}

export interface GetThreadRepliesOptions {
  campaignId: number;
  actionId: number;
  viewer: MissiveViewer;
}

// Tutte le risposte di un thread (T-0xx "risposte alle missive"), radice
// esclusa: un filtro unico su `actionData.threadRootId` — mai una risalita a
// catena (vedi il commento su `missiveActionSchema.threadRootId` in
// `handlers/missive.ts`, che garantisce che OGNI risposta punti sempre alla
// radice, mai al messaggio immediatamente precedente). `charactersById` è
// costruita una sola volta e riusata per ogni riga, stesso pattern di
// `getMissiveByIdScoped`/`listMissivesForCampaign` — non una query
// `Character` per messaggio.
//
// NON ri-verifica la visibilità per singolo messaggio (nessun
// `buildVisibleWhere`/filtro sul `viewer`, a parte l'uso di `viewer` per
// `readDate`/`masterSenderName`, identico a `getMissiveByIdScoped`): i due
// partecipanti di un thread sono SEMPRE gli stessi due Character della
// radice (si scambiano il turno, ma l'insieme resta quello), e il chiamante
// ha già superato il gate di visibilità sulla radice stessa
// (`getMissiveByIdScoped`) prima di chiamare questa funzione — riverificarlo
// per ogni risposta sarebbe ridondante.
export async function getThreadReplies(
  prisma: PrismaClient,
  { campaignId, actionId, viewer }: GetThreadRepliesOptions
): Promise<MissiveWithSender[]> {
  const rows = await prisma.action.findMany({
    where: {
      feature: { campaignId, featureType: { functionName: FT_MISSIVE } },
      actionData: { path: ["threadRootId"], equals: actionId },
    },
    include: missiveSenderInclude,
    orderBy: { creationDate: "asc" },
  });
  if (rows.length === 0) return [];

  const campaignCharacters = await prisma.character.findMany({
    where: { campaignId },
    select: {
      id: true,
      name: true,
      avatar: true,
      type: true,
      user: { select: { name: true } },
    },
  });
  const charactersById: CharactersById = new Map(
    (campaignCharacters ?? []).map(character => [
      character.id,
      {
        name: character.name,
        avatar: character.avatar,
        userName: character.user.name,
        type: character.type,
      },
    ])
  );

  return rows.map(row => {
    const { creationDate, ...rest } = row;
    return {
      ...rest,
      sendDate: creationDate,
      receiver: resolveReceiver(row.actionData, charactersById),
      readDate: resolveReadDate(row.actionData, viewer, creationDate),
      isCommunication: isCommunicationMissive(row.actionData),
      isFreeReceiver: isFreeReceiverMissive(row.actionData),
      isMasterReceiver: isMasterTargetedReply(row.actionData),
      receiverFreeText: resolveFreeReceiverText(row.actionData),
      readByCharacters: resolveReadByCharacters(
        row.actionData,
        viewer,
        charactersById
      ),
      masterSenderName: resolveMasterSenderName(row, viewer),
      isReply: true,
      threadRootId: resolveThreadRootId(row.actionData),
    };
  });
}

export interface ReplyEligibility {
  allowed: boolean;
  // Personaggio che ha diritto a scrivere ORA (l'ultimo a "ricevere" nel
  // thread, radice inclusa se non ci sono ancora risposte): il chiamante
  // (l'handler) lo confronta con l'id del personaggio che sta davvero
  // inviando, mai fidandosi del client. Presente quando tocca a un PG
  // scrivere — sia in un thread reale PG↔PG sia, in un thread "a nome del
  // master", quando tocca al PG rispondere al master (vedi sotto).
  expectedSenderCharacterId?: number;
  // Personaggio che riceverà QUESTA risposta (l'altra parte dello scambio):
  // il chiamante deve usare questo valore per sovrascrivere
  // `actionData.receiverCharacterId` prima di creare l'`Action`, mai quello
  // dichiarato dal client (stesso principio già applicato al
  // `Character.type`, vedi `missiveActionSchema`). Presente sia in un thread
  // reale PG↔PG sia quando tocca al MASTER rispondere (il destinatario resta
  // sempre il PG del thread, vedi `expectedSenderUserId` sotto).
  expectedReceiverCharacterId?: number;
  // Utente master che ha diritto a scrivere ORA (T-0xx, missive "a nome del
  // master" rispondibili): presente SOLO quando tocca al master rispondere,
  // ed è SEMPRE l'autore della RADICE del thread (`root.authorUserId`), mai
  // l'ultimo mittente — nessun altro master della campagna può raccogliere
  // il turno. Il chiamante (`createMasterMissiveAction`) lo confronta con
  // l'id dell'utente master che sta davvero scrivendo, mai fidandosi del
  // client.
  expectedSenderUserId?: string;
  // Utente master che riceverà QUESTA risposta di un PG (T-0xx): presente
  // SOLO quando tocca a un PG rispondere DENTRO un thread "a nome del
  // master" — non c'è un `Character` destinatario reale, il chiamante
  // (`handler` in `handlers/missive.ts`) lo salva come
  // `actionData.receiverUserId`, mai `receiverCharacterId`.
  expectedReceiverUserId?: string;
  reason?: string;
}

export interface GetReplyEligibilityOptions {
  campaignId: number;
  rootActionId: number;
  config: Pick<
    MissiveFeatureData,
    "canAnswer" | "canAnswerThread" | "maxThreadMessages"
  >;
}

// Legge `actionData.receiverCharacterId` grezzo, senza risolvere alcun
// `Character` — usata qui solo per determinare CHI ha diritto al turno
// successivo, non per mostrare nulla all'utente (quello è compito di
// `resolveReceiver`, che richiede la `charactersById` completa).
function rawReceiverCharacterId(
  actionData: Prisma.JsonValue
): number | undefined {
  return (actionData as { receiverCharacterId?: number } | null)
    ?.receiverCharacterId;
}

// Legge `actionData.allowReply` grezzo, stesso pattern di
// `rawReceiverCharacterId` sopra: chiave assente (dati legacy scritti prima
// dell'introduzione del checkbox) o `true` = permesso, coerente col default
// Zod (`missiveActionSchema.allowReply`) — solo `false` esplicito chiude il
// thread a QUESTO messaggio.
function rawAllowReply(actionData: Prisma.JsonValue): boolean {
  return (actionData as { allowReply?: boolean } | null)?.allowReply !== false;
}

// Gate server-side per "chi può rispondere a questa missiva, e a chi" (T-0xx):
// SOLO il ramo reale (mittente E destinatario `Character` della campagna) è
// mai rispondibile — una Comunicazione, una missiva "a nome del master"
// (`characterId: null`) o "Campo libero" (`receiverFreeText`) tornano sempre
// `{ allowed: false }`, prima ancora di guardare la configurazione di
// campagna. Il chiamante (`handler` in `handlers/missive.ts`) esegue questo
// controllo DENTRO la stessa transazione della creazione della risposta (non
// prima, in sola lettura): due risposte quasi simultanee allo stesso thread
// altrimenti potrebbero superare entrambe il gate in lettura prima che la
// prima abbia scritto la propria `Action`, producendo due risposte allo
// stesso turno.
export async function getReplyEligibility(
  prisma: PrismaTransactionClient,
  { campaignId, rootActionId, config }: GetReplyEligibilityOptions
): Promise<ReplyEligibility> {
  const root = await prisma.action.findFirst({
    where: {
      id: rootActionId,
      feature: { campaignId, featureType: { functionName: FT_MISSIVE } },
    },
    select: { characterId: true, actionData: true, authorUserId: true },
  });
  if (!root) {
    return {
      allowed: false,
      reason: "La missiva a cui rispondere non esiste.",
    };
  }
  if (
    isCommunicationMissive(root.actionData) ||
    isFreeReceiverMissive(root.actionData)
  ) {
    return {
      allowed: false,
      reason:
        "Le Comunicazioni e le missive con destinatario a testo libero non sono rispondibili.",
    };
  }
  // Guardia per dati legacy (T-0xx, missive "a nome del master"
  // rispondibili): un record `characterId: null` scritto PRIMA
  // dell'introduzione di `Action.authorUserId` non ha modo di sapere quale
  // utente master fasare per il turno successivo — non rispondibile, non un
  // bug del calcolo sotto.
  if (root.characterId === null && root.authorUserId === null) {
    return {
      allowed: false,
      reason: "Impossibile determinare l'autore master di questa missiva.",
    };
  }

  const parsedRoot = missiveActionSchema.safeParse(root.actionData);
  if (!parsedRoot.success) {
    return { allowed: false, reason: "Missiva radice non valida." };
  }

  if (!config.canAnswer) {
    return {
      allowed: false,
      reason: "Le risposte non sono abilitate per questa campagna.",
    };
  }

  const replies = await prisma.action.findMany({
    where: {
      feature: { campaignId, featureType: { functionName: FT_MISSIVE } },
      actionData: { path: ["threadRootId"], equals: rootActionId },
    },
    select: {
      characterId: true,
      actionData: true,
      authorUserId: true,
      creationDate: true,
    },
    orderBy: { creationDate: "asc" },
  });

  if (replies.length > 0 && !config.canAnswerThread) {
    return {
      allowed: false,
      reason: "Questa missiva ha già ricevuto una risposta.",
    };
  }

  // Tetto numerico al thread (T-0xx), consultato SOLO quando
  // `canAnswerThread` è attivo (il check sopra ha già chiuso il caso
  // contrario). Il conteggio include la radice (messaggio 1), quindi
  // `maxThreadMessages` pari implica uno scambio simmetrico fra i due lati
  // (il primo messaggio lo scrive sempre chi ha aperto il thread) — es. 4 =
  // 2 invii a testa, 6 = 3 a testa, 10 = 5 a testa; un valore dispari dà un
  // invio in più al lato che ha aperto il thread. Si applica IDENTICO sia a
  // un thread reale PG↔PG sia a un thread "a nome del master" (guarda solo
  // il numero di righe, non `characterId`/`authorUserId`), va quindi
  // posizionato PRIMA della divaricazione fra i due rami sotto.
  if (config.canAnswerThread) {
    const totalMessages = 1 + replies.length; // radice + risposte finora
    if (totalMessages >= config.maxThreadMessages) {
      return {
        allowed: false,
        reason:
          "Il thread ha raggiunto il numero massimo di messaggi consentiti.",
      };
    }
  }

  // Ultimo messaggio del thread (radice se non ci sono ancora risposte,
  // altrimenti l'ultima risposta): decide il PROSSIMO turno.
  const last = replies.length > 0 ? replies[replies.length - 1] : root;

  // Vincolo PER-MESSAGGIO (T-0xx): chi ha scritto l'ULTIMO messaggio del
  // thread può aver disattivato "Permetti al destinatario di rispondere" —
  // si applica ad ENTRAMBI i rami sotto (thread reale PG↔PG e thread "a nome
  // del master"), prima di qualunque calcolo su chi ha diritto al turno
  // successivo: se questo messaggio non è rispondibile, non lo è a
  // prescindere da chi dovrebbe rispondere. Non è l'unico punto in cui il
  // vincolo conta (`getReplyEligibility` guarda sempre l'ultimo messaggio,
  // mai la radice), quindi un messaggio precedente con `allowReply: false`
  // che non sia l'ultimo non ha alcun effetto qui.
  if (!rawAllowReply(last.actionData)) {
    return {
      allowed: false,
      reason: "Il mittente non ha permesso una risposta a questo messaggio.",
    };
  }

  // Thread reale PG↔PG (`root.characterId !== null`, mittente e destinatario
  // SEMPRE `Character` reali): invariato, il turno si scambia fra gli stessi
  // due `Character` per l'intera vita del thread, mai coinvolgendo il
  // master — `rawReceiverCharacterId(last.actionData)` funziona
  // uniformemente anche quando `last === root` (la radice ha comunque la
  // chiave `receiverCharacterId` nel JSON), senza bisogno del vecchio ramo
  // speciale su `replies.length === 0`.
  if (root.characterId !== null) {
    const lastReceiverCharacterId = rawReceiverCharacterId(last.actionData);
    if (lastReceiverCharacterId === undefined || last.characterId === null) {
      return { allowed: false, reason: "Impossibile determinare il turno." };
    }
    return {
      allowed: true,
      expectedSenderCharacterId: lastReceiverCharacterId,
      expectedReceiverCharacterId: last.characterId,
    };
  }

  // Thread "a nome del master" (`root.characterId === null`): alterna fra
  // l'utente master AUTORE DELLA RADICE (mai l'ultimo mittente, mai un
  // master diverso della stessa campagna) e il PG bersaglio.
  if (last.characterId === null) {
    // Tocca al PG: il mittente atteso è il destinatario dell'ultimo
    // messaggio del master (radice o sua risposta, stessa chiave JSON), il
    // destinatario di QUESTA risposta è l'utente master che l'ha scritto —
    // non un `Character`, salvato come `actionData.receiverUserId` (vedi
    // `handler` in `handlers/missive.ts`).
    const lastReceiverCharacterId = rawReceiverCharacterId(last.actionData);
    if (lastReceiverCharacterId === undefined) {
      return { allowed: false, reason: "Impossibile determinare il turno." };
    }
    return {
      allowed: true,
      expectedSenderCharacterId: lastReceiverCharacterId,
      expectedReceiverUserId: last.authorUserId ?? undefined,
    };
  }

  // Tocca al master: SOLO l'autore della radice può raccogliere il turno,
  // mai l'ultimo mittente (che è sempre lo stesso PG in questo tipo di
  // thread, ma non è lui a decidere chi risponde). Il destinatario resta
  // sempre lo stesso PG (`last.characterId`).
  if (root.authorUserId === null) {
    return {
      allowed: false,
      reason: "Impossibile determinare l'autore master di questa missiva.",
    };
  }
  return {
    allowed: true,
    expectedSenderUserId: root.authorUserId,
    expectedReceiverCharacterId: last.characterId,
  };
}

// Segna la missiva come letta (T-0xx, badge Ricevuto/Letto): idempotente
// (`readDate` già valorizzato → no-op) e scopata sia alla campagna sia al
// destinatario ATTESO (`expectedReceiverCharacterId`) — chi chiama deve aver
// già verificato che il chiamante sia il proprietario di quel personaggio
// (vedi la route `PATCH .../missive/[id]/read`), questa funzione aggiunge
// solo un ultimo controllo di coerenza (l'id passato deve combaciare con
// quello REALMENTE salvato in `actionData`, non fidarsi del solo
// `missive.receiver` già risolto dal chiamante). Ritorna `false` se la
// missiva non esiste in questa campagna o non è diretta a quel personaggio
// — il chiamante decide come tradurlo (404/403).
export async function markMissiveAsRead(
  prisma: PrismaClient,
  {
    campaignId,
    actionId,
    expectedReceiverCharacterId,
  }: {
    campaignId: number;
    actionId: number;
    expectedReceiverCharacterId: number;
  }
): Promise<boolean> {
  const action = await prisma.action.findFirst({
    where: {
      id: actionId,
      feature: { campaignId, featureType: { functionName: FT_MISSIVE } },
    },
    select: { actionData: true },
  });
  if (!action) return false;

  const data = action.actionData as {
    receiverCharacterId?: number;
    readDate?: string | null;
  } | null;
  if (data?.receiverCharacterId !== expectedReceiverCharacterId) return false;
  if (data.readDate) return true;

  await prisma.action.update({
    where: { id: actionId },
    data: { actionData: { ...data, readDate: new Date().toISOString() } },
  });
  return true;
}

export type UpdateMissiveContentResult =
  "updated" | "already-read" | "not-found";

export interface UpdateMissiveContentOptions {
  campaignId: number;
  actionId: number;
  // Character.id del mittente reale: il chiamante (route) ha già verificato
  // che sia proprio il PG del chiamante — passato di nuovo qui come ulteriore
  // scoping della `where`, stesso principio di `expectedReceiverCharacterId`
  // in `markMissiveAsRead` (non fidarsi di un solo controllo a monte).
  authorCharacterId: number;
  description: string;
}

// Modifica il CONTENUTO di una missiva già inviata (T-0xx, "modifica
// missiva"), SOLO se il destinatario non l'ha ancora letta — mai per
// Comunicazione/"Campo libero"/"a nome del master" (il chiamante deve aver
// già escluso quei rami, questa funzione scopa solo su `characterId` reale).
// Non c'è alcun campo `version` nello schema: il lock ottimistico contro la
// lettura concorrente è un compare-and-swap sull'INTERO `actionData` letto
// un istante prima (`action.actionData`, passato tal quale come `equals`
// nella `where` dell'`updateMany` sotto) — se il destinatario legge la
// missiva fra il momento in cui il mittente apre il form e il salvataggio
// (`markMissiveAsRead`, l'UNICO altro scrittore possibile di questo
// `actionData` sul ramo reale), il valore in DB non combacia più con lo
// snapshot e `count` torna 0, senza bisogno di una transazione esplicita.
// NON un filtro `path: ["readDate"], not: Prisma.DbNull` (bug reale
// corretto qui, un 409 anche su una missiva mai letta): quel filtro
// distingue in modo affidabile "chiave assente" da "chiave presente", non
// "chiave presente con `null` esplicito" da "chiave presente con un valore
// reale" — e `readDate` è SEMPRE scritto esplicitamente (`null` alla
// creazione, mai assente, vedi `missiveActionSchema.readDate`), quindi quel
// filtro combaciava sempre con `false`. Il check veloce su `data?.readDate`
// subito sotto resta comunque utile: evita del tutto l'`updateMany` quando
// è già ovviamente troppo tardi.
export async function updateMissiveContentIfUnread(
  prisma: PrismaClient,
  {
    campaignId,
    actionId,
    authorCharacterId,
    description,
  }: UpdateMissiveContentOptions
): Promise<UpdateMissiveContentResult> {
  const action = await prisma.action.findFirst({
    where: {
      id: actionId,
      characterId: authorCharacterId,
      feature: { campaignId, featureType: { functionName: FT_MISSIVE } },
    },
    select: { actionData: true },
  });
  if (!action) return "not-found";

  const data = action.actionData as { readDate?: string | null } | null;
  if (data?.readDate) return "already-read";

  // Compare-and-swap sull'INTERO `actionData` (non un filtro `path`/
  // `Prisma.DbNull` su `readDate`): quel filtro distingue in modo affidabile
  // "chiave assente" da "chiave presente", non "chiave presente con valore
  // JSON `null` esplicito" da "chiave presente con un valore reale" — e
  // `readDate` è SEMPRE scritto esplicitamente (`null` alla creazione, mai
  // assente, vedi `missiveActionSchema.readDate`), quindi quel filtro
  // combaciava sempre con `false` (bug reale, un 409 anche su una missiva
  // mai letta). Il confronto sull'intero valore JSON letto un istante prima
  // resta invece un `=` diretto (uguaglianza strutturale jsonb), senza
  // ambiguità: se `markMissiveAsRead` (l'UNICO altro scrittore possibile di
  // questo stesso `actionData` sul ramo reale) ha valorizzato `readDate` fra
  // la lettura sopra e questo `updateMany`, il valore in DB non combacia più
  // con lo snapshot e `count` torna 0.
  const { count } = await prisma.action.updateMany({
    where: {
      id: actionId,
      characterId: authorCharacterId,
      actionData: { equals: action.actionData as Prisma.InputJsonValue },
    },
    data: {
      actionData: { ...(data ?? {}), description },
    },
  });

  return count > 0 ? "updated" : "already-read";
}

// Equivalente di `markMissiveAsRead` per una Comunicazione (T-0xx): niente
// `expectedReceiverCharacterId` da far combaciare (non c'è un destinatario
// unico), il tracking è un `push` di TUTTI i `characterIds` passati dentro
// `actionData.readByCharacterIds` — dedup (id già presenti → non
// riaggiunti), un solo `update` per l'intero batch, idempotente (nessun id
// nuovo da aggiungere → no-op, nessuna chiamata a `prisma.action.update`).
// Chi chiama (`PATCH .../missive/[id]/read`) passa TUTTI i PG attivi del
// chiamante, non solo il primo: una persona con più di un PG attivo nella
// stessa campagna deve risultare "ha letto" con OGNI suo PG attivo, non
// solo uno (bug reale corretto qui — prima si passava un solo
// `characterId`, marcando come letto solo il primo PG attivo del
// chiamante). Ritorna `false` se l'action non esiste in questa campagna o
// non è una Comunicazione (`isCommunicationMissive`), stesso trattamento
// 404/403 lasciato al chiamante di `markMissiveAsRead`.
export async function markCommunicationMissiveAsRead(
  prisma: PrismaClient,
  {
    campaignId,
    actionId,
    characterIds,
  }: {
    campaignId: number;
    actionId: number;
    characterIds: number[];
  }
): Promise<boolean> {
  const action = await prisma.action.findFirst({
    where: {
      id: actionId,
      feature: { campaignId, featureType: { functionName: FT_MISSIVE } },
    },
    select: { actionData: true },
  });
  if (!action || !isCommunicationMissive(action.actionData)) return false;

  const data = action.actionData as {
    readByCharacterIds?: number[];
  } | null;
  const readByCharacterIds = data?.readByCharacterIds ?? [];
  const newIds = characterIds.filter(id => !readByCharacterIds.includes(id));
  if (newIds.length === 0) return true;

  await prisma.action.update({
    where: { id: actionId },
    data: {
      actionData: {
        ...(data ?? {}),
        readByCharacterIds: [...readByCharacterIds, ...newIds],
      },
    },
  });
  return true;
}

// Equivalente di `markMissiveAsRead` per una missiva "Campo libero" (T-0xx):
// niente `expectedReceiverCharacterId` da far combaciare — non esiste un
// `Character` destinatario, quindi nessun controllo di coerenza possibile
// su quel fronte — il gate è solo `isFreeReceiverMissive` (chi chiama deve
// aver già verificato che il chiamante sia un master, vedi la route
// `PATCH .../missive/[id]/read`). Idempotente (`readDate` già valorizzato →
// no-op), stesso `readDate` singolo del ramo reale (non un array per-PG
// come `markCommunicationMissiveAsRead`: qui c'è un solo "letta", quella del
// primo master che apre). Ritorna `false` se la missiva non esiste in
// questa campagna o non è "Campo libero" — il chiamante decide come
// tradurlo (404/403).
export async function markFreeReceiverMissiveAsRead(
  prisma: PrismaClient,
  {
    campaignId,
    actionId,
  }: {
    campaignId: number;
    actionId: number;
  }
): Promise<boolean> {
  const action = await prisma.action.findFirst({
    where: {
      id: actionId,
      feature: { campaignId, featureType: { functionName: FT_MISSIVE } },
    },
    select: { actionData: true },
  });
  if (!action || !isFreeReceiverMissive(action.actionData)) return false;

  const data = action.actionData as { readDate?: string | null } | null;
  if (data?.readDate) return true;

  await prisma.action.update({
    where: { id: actionId },
    data: { actionData: { ...data, readDate: new Date().toISOString() } },
  });
  return true;
}
