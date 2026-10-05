import {
  NotificationType,
  type Action,
  type Character,
  type Prisma,
  type PrismaClient,
  type User,
} from "@prisma/client";
import { FT_DOWNTIME } from "../features/featuresName";
import { type DowntimeStatus } from "../downtime/status";
import { createNotification } from "./notification.repository";

// Viewer per la visibilità del downtime (T-0xx): stesso concetto di
// `MissiveViewer`, ma senza `hasActiveCharacter` (nessuna Comunicazione qui)
// — un master (o chiunque abbia un ruolo di campagna, deciso dal chiamante) vede
// TUTTE le downtime della campagna; un giocatore senza ruolo vede solo
// quelle dei PROPRI personaggi (`characterId` in `characterIds`), mai per
// "ricevute" (un'`Action` downtime non ha un destinatario).
export type DowntimeViewer =
  { isMaster: true } | { isMaster: false; characterIds: number[] };

export interface ListDowntimesFilters {
  authorCharacterId?: number;
  // Filtrato in memoria (T-0xx, fix catalogo globale): la categoria vive
  // ormai dentro `actionData.category` (stringa libera), non più in una
  // relazione `Feature`/`FeatureType` filtrabile a livello Prisma — stesso
  // trattamento di `search`/`status` sotto.
  category?: string;
  dateFrom?: Date;
  dateTo?: Date;
  // Match case-insensitive su nome PG autore/nome giocatore/nome categoria,
  // applicato in memoria (vedi `matchesSearch` sotto) — stesso principio di
  // `ListMissivesFilters.search`: la descrizione vive dentro `actionData`
  // (Json) e non è cercata (vedi il brief).
  search?: string;
  // Filtrato in memoria (stesso motivo di `search`, applicato DOPO di esso):
  // righe storiche senza `status` nel JSON risolvono a `"waiting"` di
  // default (`resolveDowntimeStatus`), che un filtro Prisma su
  // `actionData.status` non troverebbe (non hanno la chiave).
  status?: DowntimeStatus;
}

export interface ListDowntimesOptions {
  campaignId: number;
  viewer: DowntimeViewer;
  filters?: ListDowntimesFilters;
  page: number;
  pageSize: number;
}

// Riga grezza come tornata da Prisma: `character` non è mai `null` per una
// downtime reale (ogni `Action` downtime ha sempre un `characterId`, vedi il
// brief) — resta comunque tipato nullable perché è quello che Prisma
// restituisce per una relazione opzionale; le righe con `character: null`
// (dato corrotto, mai atteso) vengono scartate in silenzio, vedi `toAuthor`
// sotto. Nessun `include` su `feature`/`featureType` (T-0xx, fix catalogo
// globale): la categoria vive ormai in `actionData.category`, non serve più
// risolverla via join.
type DowntimeActionRow = Action & {
  character:
    | (Pick<Character, "id" | "name" | "avatar"> & {
        user: Pick<User, "name">;
      })
    | null;
};

export interface DowntimeAuthorDetail {
  id: number;
  name: string;
  avatar: string | null;
  userName: string;
}

// Shape usata sia dalla lista sia dal dettaglio, stesso ruolo di
// `MissiveWithSender`: `author`/`category` arricchiscono la riga grezza,
// `readDate` è risolto da `actionData.readDate` (`null` finché nessun
// master apre il dettaglio, vedi `markDowntimeAsRead` sotto). `status`/
// `response` sono risolti allo stesso modo da `actionData.status`/
// `actionData.response` (default `"waiting"`/`null`, vedi
// `resolveDowntimeStatus`/`resolveDowntimeResponse` sotto) — `response` è
// calcolato anche per la riga di lista, che semplicemente lo ignora (nessun
// bisogno di due varianti del tipo). `actionData` resta sulla riga (non
// omesso): la route di dettaglio ne estrae `description` a parte, stesso
// pattern di `parseMissiveActionData` nella route missive.
export type DowntimeWithAuthor = DowntimeActionRow & {
  author: DowntimeAuthorDetail;
  category: string;
  readDate: Date | null;
  status: DowntimeStatus;
  response: string | null;
  // Nota riservata (T-0xx): stessa risoluzione di `response`
  // (`actionData.masterNote`/`resolveDowntimeMasterNote`), ma MAI da
  // esporre a un giocatore — filtrata dal chiamante (route/page), mai qui
  // (questo repository non conosce il viewer del dettaglio).
  masterNote: string | null;
  // `null` finché il master non ha mai modificato la downtime (stato e/o
  // risposta) — vedi `resolveDowntimeUpdateDate`/`updateDowntimeStatus`.
  updateDate: Date | null;
};

export interface DowntimeAuthorOption {
  id: number;
  name: string;
  avatar: string | null;
}

export interface DowntimeFilterOptions {
  authors: DowntimeAuthorOption[];
  categories: string[];
}

export interface DowntimePagination {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface ListDowntimesResult {
  downtimes: DowntimeWithAuthor[];
  filterOptions: DowntimeFilterOptions;
  pagination: DowntimePagination;
}

// Filtro di visibilità (enforced qui, non lato client — vedi CLAUDE.md
// "Visibilità server-side"): un master non ha alcun filtro aggiuntivo; un
// giocatore vede solo `characterId in characterIds`. Se il giocatore non ha
// alcun PG, il sentinel `{ id: -1 }` chiude esplicitamente a "nessuna
// downtime visibile" (stesso principio di `buildVisibilityWhere` in
// `missive.repository.ts`).
function buildVisibilityWhere(viewer: DowntimeViewer): Prisma.ActionWhereInput {
  // `=== true` esplicito: stesso motivo di `missive.repository.ts` (con
  // `strictNullChecks: false` il narrowing su una union dopo un early
  // return non è affidabile senza un confronto esplicito).
  if (viewer.isMaster === true) return {};
  return viewer.characterIds.length > 0
    ? { characterId: { in: viewer.characterIds } }
    : { id: -1 };
}

function buildAuthorWhere(authorCharacterId?: number): Prisma.ActionWhereInput {
  if (authorCharacterId === undefined) return {};
  return { characterId: authorCharacterId };
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
// `Feature` container `FT_DOWNTIME` della campagna (T-0xx, fix catalogo
// globale: un solo `functionName` possibile ora, nessuna categoria come
// `Feature`/`FeatureType` separata), più la visibilità del viewer.
function buildVisibleWhere(
  campaignId: number,
  viewer: DowntimeViewer
): Prisma.ActionWhereInput {
  return {
    feature: {
      campaignId,
      featureType: { functionName: FT_DOWNTIME },
    },
    ...buildVisibilityWhere(viewer),
  };
}

const downtimeInclude = {
  character: {
    select: {
      id: true,
      name: true,
      avatar: true,
      user: { select: { name: true } },
    },
  },
} as const;

function readCategory(actionData: Prisma.JsonValue): string {
  return (actionData as { category?: string } | null)?.category ?? "";
}

function matchesSearch(row: DowntimeActionRow, search: string): boolean {
  const actionData = row.actionData as { subject?: string } | null;
  const haystack = [
    actionData?.subject,
    row.character?.name,
    row.character?.user.name,
    readCategory(row.actionData),
  ]
    .filter((value): value is string => !!value)
    .map(value => value.toLowerCase());

  return haystack.some(value => value.includes(search));
}

// Legge `actionData.readDate` (stringa ISO salvata da `markDowntimeAsRead`):
// nessuna chiave legacy da tollerare (feature nuova, mai esistita con un
// altro nome), a differenza di `resolveReadDate` in `missive.repository.ts`.
function resolveReadDate(actionData: Prisma.JsonValue): Date | null {
  const value = (actionData as { readDate?: string | null } | null)?.readDate;
  return value ? new Date(value) : null;
}

// Legge `actionData.status` (salvato da `handler()` in
// `handlers/downtimeAction.ts` alla creazione, aggiornato da
// `updateDowntimeStatus` sotto): default `"waiting"` per le righe storiche
// create prima di questa feature, che non hanno la chiave nel JSON.
function resolveDowntimeStatus(actionData: Prisma.JsonValue): DowntimeStatus {
  const value = (actionData as { status?: DowntimeStatus } | null)?.status;
  return value ?? "waiting";
}

// Legge `actionData.response` (salvato da `updateDowntimeStatus` sotto):
// `null` finché nessun master ha aggiunto una risposta — una stringa vuota
// conta come "nessuna risposta" (coerente con la Card di risposta in
// `DowntimeReader.tsx`, che non deve comparire senza contenuto).
function resolveDowntimeResponse(actionData: Prisma.JsonValue): string | null {
  const value = (actionData as { response?: string | null } | null)?.response;
  return value ? value : null;
}

// Legge `actionData.masterNote` (salvato da `updateDowntimeStatus` sotto):
// stessa risoluzione di `resolveDowntimeResponse` (stringa vuota conta come
// "nessuna nota") — la visibilità (mai a un giocatore) è responsabilità del
// chiamante, non di questo helper.
function resolveDowntimeMasterNote(
  actionData: Prisma.JsonValue
): string | null {
  const value = (actionData as { masterNote?: string | null } | null)
    ?.masterNote;
  return value ? value : null;
}

// Legge `actionData.updateDate` (stringa ISO): ultima modifica della
// downtime da parte del master (stato e/o risposta), salvata da
// `updateDowntimeStatus` sotto ad OGNI chiamata — a differenza di
// `readDate` non è idempotente. `null` finché il master non ha mai
// modificato la downtime.
function resolveDowntimeUpdateDate(actionData: Prisma.JsonValue): Date | null {
  const value = (actionData as { updateDate?: string | null } | null)
    ?.updateDate;
  return value ? new Date(value) : null;
}

function toAuthor(row: DowntimeActionRow): DowntimeAuthorDetail | null {
  if (!row.character) return null;
  return {
    id: row.character.id,
    name: row.character.name,
    avatar: row.character.avatar,
    userName: row.character.user.name,
  };
}

// Opzioni disponibili per i `FieldSelect` "Personaggio autore"/"Categoria
// downtime" (T-0xx): calcolate sull'insieme visibile AL VIEWER, ignorando
// gli altri filtri applicati in quel momento — stesso principio di
// `buildFilterOptions` in `missive.repository.ts` (le select non si
// svuotano/riordinano mentre l'utente affina la ricerca).
function buildFilterOptions(rows: DowntimeActionRow[]): DowntimeFilterOptions {
  const authorsById = new Map<number, DowntimeAuthorOption>();
  const categories = new Set<string>();

  for (const row of rows) {
    if (row.character) {
      authorsById.set(row.character.id, {
        id: row.character.id,
        name: row.character.name,
        avatar: row.character.avatar,
      });
    }
    const category = readCategory(row.actionData);
    if (category) categories.add(category);
  }

  return {
    authors: Array.from(authorsById.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "it")
    ),
    categories: Array.from(categories).sort((a, b) => a.localeCompare(b, "it")),
  };
}

// Lista delle downtime visibili al viewer (T-0xx): stessi principi di
// `listMissivesForCampaign` — filtri strutturali (autore/categoria/date) a
// livello Prisma, `search` in memoria, paginazione applicata DOPO `search`.
// Le opzioni filtro sono una query separata sullo stesso `where` di
// visibilità (senza i filtri strutturali, MAI paginata).
export async function listDowntimesForCampaign(
  prisma: PrismaClient,
  { campaignId, viewer, filters = {}, page, pageSize }: ListDowntimesOptions
): Promise<ListDowntimesResult> {
  const visibleWhere = buildVisibleWhere(campaignId, viewer);

  const where: Prisma.ActionWhereInput = {
    ...visibleWhere,
    ...buildAuthorWhere(filters.authorCharacterId),
    ...buildDateWhere(filters.dateFrom, filters.dateTo),
  };

  const [rows, optionRows] = await Promise.all([
    prisma.action.findMany({
      where,
      include: downtimeInclude,
      orderBy: { creationDate: "desc" },
    }),
    prisma.action.findMany({
      where: visibleWhere,
      include: downtimeInclude,
    }),
  ]);

  const search = filters.search?.trim().toLowerCase();
  const searchedRows = search
    ? rows.filter(row => matchesSearch(row, search))
    : rows;

  // `category` (T-0xx, fix catalogo globale) è filtrata in memoria come
  // `search`/`status`: vive dentro `actionData`, non è più una relazione
  // Prisma-filtrabile.
  const categoryFilteredRows = filters.category
    ? searchedRows.filter(
        row => readCategory(row.actionData) === filters.category
      )
    : searchedRows;

  // Stesso ordine di `search` (prima dei filtri strutturali già applicati a
  // livello Prisma, poi in memoria, poi la paginazione): vedi il commento su
  // `ListDowntimesFilters.status` per il perché non è un filtro Prisma.
  const filteredRows = filters.status
    ? categoryFilteredRows.filter(
        row => resolveDowntimeStatus(row.actionData) === filters.status
      )
    : categoryFilteredRows;

  const totalCount = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const start = (page - 1) * pageSize;
  const pageRows = filteredRows.slice(start, start + pageSize);

  const downtimes: DowntimeWithAuthor[] = pageRows
    .map((row): DowntimeWithAuthor | null => {
      const author = toAuthor(row);
      if (!author) return null;
      return {
        ...row,
        author,
        category: readCategory(row.actionData),
        readDate: resolveReadDate(row.actionData),
        status: resolveDowntimeStatus(row.actionData),
        response: resolveDowntimeResponse(row.actionData),
        masterNote: resolveDowntimeMasterNote(row.actionData),
        updateDate: resolveDowntimeUpdateDate(row.actionData),
      };
    })
    .filter((row): row is DowntimeWithAuthor => row !== null);

  return {
    downtimes,
    filterOptions: buildFilterOptions(optionRows),
    pagination: { page, pageSize, totalCount, totalPages },
  };
}

export interface GetDowntimeOptions {
  campaignId: number;
  actionId: number;
  viewer: DowntimeViewer;
}

// Risoluzione scopata di una singola downtime (T-0xx): stessa logica di
// visibilità di `listDowntimesForCampaign`, applicata a un solo record.
// Ritorna sempre `null` (mai un errore diverso) se non trovata, non
// visibile al viewer, o se il `character` autore risulta mancante (dato
// corrotto, mai atteso — vedi `DowntimeActionRow`).
export async function getDowntimeByIdScoped(
  prisma: PrismaClient,
  { campaignId, actionId, viewer }: GetDowntimeOptions
): Promise<DowntimeWithAuthor | null> {
  const row = await prisma.action.findFirst({
    where: { id: actionId, ...buildVisibleWhere(campaignId, viewer) },
    include: downtimeInclude,
  });
  if (!row) return null;

  const author = toAuthor(row);
  if (!author) return null;

  return {
    ...row,
    author,
    category: readCategory(row.actionData),
    readDate: resolveReadDate(row.actionData),
    status: resolveDowntimeStatus(row.actionData),
    response: resolveDowntimeResponse(row.actionData),
    masterNote: resolveDowntimeMasterNote(row.actionData),
    updateDate: resolveDowntimeUpdateDate(row.actionData),
  };
}

// Segna la downtime come letta (T-0xx, badge Aperta/Non letta): idempotente
// (`readDate` già valorizzato → no-op), scopata alla campagna e alle
// categorie downtime — SOLO un master può chiamarla (verificato dal
// chiamante, la route `PATCH .../downtime/[id]/read`), questa funzione non
// ha alcun "destinatario atteso" da far combaciare (a differenza di
// `markMissiveAsRead`): il downtime non ha un destinatario, solo un autore.
export async function markDowntimeAsRead(
  prisma: PrismaClient,
  { campaignId, actionId }: { campaignId: number; actionId: number }
): Promise<boolean> {
  const action = await prisma.action.findFirst({
    where: {
      id: actionId,
      feature: { campaignId, featureType: { functionName: FT_DOWNTIME } },
    },
    select: { actionData: true },
  });
  if (!action) return false;

  const data = action.actionData as { readDate?: string | null } | null;
  if (data?.readDate) return true;

  await prisma.action.update({
    where: { id: actionId },
    data: {
      actionData: { ...(data ?? {}), readDate: new Date().toISOString() },
    },
  });
  return true;
}

export interface UpdateDowntimeStatusOptions {
  campaignId: number;
  actionId: number;
  status: DowntimeStatus;
  response?: string;
  // Nota riservata (T-0xx): stessa semantica opzionale di `response`, ma mai
  // restituita/leggibile da un giocatore (vedi `DowntimeReader.tsx`/route
  // GET di dettaglio, che la azzerano per un viewer non master).
  masterNote?: string;
}

export interface UpdateDowntimeStatusResult {
  status: DowntimeStatus;
  response: string | null;
  masterNote: string | null;
  updateDate: Date;
}

// Cambia lo stato di approvazione della downtime (T-0xx), con un'eventuale
// risposta del master: stesso schema di scoping di `markDowntimeAsRead`
// (`findFirst` scopato a `campaignId` + categorie downtime), ma NON
// idempotente — a differenza della lettura, il master può cambiare
// status/risposta in qualunque momento, anche più volte (verificato dal
// chiamante, la route `PATCH .../downtime/[id]/status`). `subject`/
// `description`/`readDate` esistenti sono preservati nello spread, stesso
// pattern di `markDowntimeAsRead` — `response` assente/vuota viene salvata
// come `null` (nessuna risposta), mai come stringa vuota. `updateDate`
// viene sempre riscritta a `now()` ad ogni chiamata (mai preservata),
// coerente col fatto che questa funzione non è idempotente.
export async function updateDowntimeStatus(
  prisma: PrismaClient,
  {
    campaignId,
    actionId,
    status,
    response,
    masterNote,
  }: UpdateDowntimeStatusOptions
): Promise<UpdateDowntimeStatusResult | null> {
  const action = await prisma.action.findFirst({
    where: {
      id: actionId,
      feature: { campaignId, featureType: { functionName: FT_DOWNTIME } },
    },
    select: {
      actionData: true,
      character: { select: { userId: true } },
    },
  });
  if (!action) return null;

  const data = action.actionData as Record<string, unknown> | null;
  const nextResponse = response || null;
  const nextMasterNote = masterNote || null;
  const updateDate = new Date();
  // Notifica (T-0xx, pannello notifiche) SOLO se lo stato cambia davvero:
  // il master può salvare più volte con lo stesso stato (es. solo per
  // aggiornare la risposta), non ha senso avvisare il giocatore di un
  // "cambio" che non c'è stato. Confrontato PRIMA dello spend/scrittura,
  // sullo stato risolto dal JSON precedente (`resolveDowntimeStatus`, stesso
  // helper usato in lettura — righe storiche senza `status` risolvono a
  // "waiting", coerente).
  const previousStatus = resolveDowntimeStatus(action.actionData);
  const statusChanged = previousStatus !== status;

  await prisma.$transaction(async tx => {
    await tx.action.update({
      where: { id: actionId },
      data: {
        actionData: {
          ...(data ?? {}),
          status,
          response: nextResponse,
          masterNote: nextMasterNote,
          updateDate: updateDate.toISOString(),
        },
      },
    });

    // Destinatario: il proprietario del `Character` autore della downtime —
    // a differenza del lato "master" (`notifyUserIds` configurabile,
    // `downtimeAction.ts`), qui c'è sempre UN solo destinatario naturale,
    // chi l'ha scritta, nessuna configurazione necessaria. `action.character`
    // può essere `null` solo per dati storici incoerenti (ogni downtime ha
    // sempre un `characterId` reale, mai "a nome del master" come le
    // missive): scartato in silenzio, mai un errore che blocca il cambio di
    // stato.
    if (statusChanged && action.character) {
      await createNotification(tx, {
        userId: action.character.userId,
        campaignId,
        type: NotificationType.downtime,
        entityId: actionId,
      });
    }
  });

  return {
    status,
    response: nextResponse,
    masterNote: nextMasterNote,
    updateDate,
  };
}
