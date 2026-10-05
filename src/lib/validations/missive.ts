import { z } from "zod";
import { Role } from "@prisma/client";
import { ROLE_COLORS } from "../constants";
import { characterTypeEnum } from "./character";

export const MISSIVE_PAGE_SIZE = 20;

export const MISSIVE_COMMUN_ID = "communication" as const;
export const MISSIVE_COMMUN_TEXT = "Comunicazione";
export const MISSIVE_COMMUN_ICON = "campaign";
export const MISSIVE_COMMUN_BG = `color-mix(in srgb, ${ROLE_COLORS[Role.head_master]} 20%, transparent)`;

export const MISSIVE_MASTER_ID = "master" as const;
export const MISSIVE_MASTER_TEXT = "Master";
export const MISSIVE_MASTER_ICON = "master";
export const MISSIVE_MASTER_BG = `color-mix(in srgb, ${ROLE_COLORS[Role.master]} 20%, transparent)`;

export type MissiveSenderFilter =
  number | typeof MISSIVE_MASTER_ID | typeof MISSIVE_COMMUN_ID;

const senderFilterSchema = z.union([
  z.coerce.number().int().positive(),
  z.literal(MISSIVE_MASTER_ID),
  z.literal(MISSIVE_COMMUN_ID),
]);

// Tab "Posta in arrivo"/"Inviate"/"Tutte le missive" (stile Gmail, T-0xx):
// per un giocatore la direzione si decide da CHI ha scritto la missiva
// (`characterId`) rispetto al viewer; per un master si decide invece da CHI
// RICEVE per "inbox" (`receiverCharacterId` uno dei propri personaggi, più
// le Comunicazioni SEMPRE) e da CHI SCRIVE per "sent" (escluse le
// Comunicazioni, che stanno sempre in "inbox") — vedi `buildBoxWhere` in
// `missive.repository.ts`. `"all"` (master-only, terza tab UI) rimuove ogni
// filtro di direzione, mostrando tutto ciò che la visibilità già consente
// (per un master: l'intera campagna). Default `"inbox"`, quindi omesso
// dall'URL quando attivo (stesso principio degli altri filtri).
export const missiveBoxEnum = z.enum(["inbox", "sent", "all"]);
export type MissiveBox = z.infer<typeof missiveBoxEnum>;

export const missiveListQuerySchema = z.object({
  senderCharacterId: senderFilterSchema.optional(),
  receiverCharacterId: z.coerce.number().int().positive().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  box: missiveBoxEnum.default("inbox"),
});

export type MissiveListQuery = z.infer<typeof missiveListQuerySchema>;

// Mittente di una missiva così come esposto dall'API: `null` = "a nome del
// master" (nessun PG reale, vedi `createMasterMissiveAction`).
export const missiveSenderSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    avatar: z.string().nullable(),
    // Nome del giocatore proprietario del PG mittente, se disponibile
    // (`character.user.name`).
    userName: z.string().nullable(),
  })
  .nullable();

// Destinatario di una missiva così come esposto dall'API: `null` se
// `actionData.receiverCharacterId` non risolve più a nessun Character della
// campagna (personaggio eliminato dopo l'invio). `type` (PG/PNG) è sempre
// derivato dal `Character` reale, mai da `actionData` — serve a
// `MissiveReader` per la label "PG"/"PNG".
// Per una missiva Comunicazione `receiver` è SEMPRE `null` (nessun
// destinatario singolo, vedi `isCommunicationMissive`): il client deve
// controllare `isCommunication` PRIMA di interpretare `null` come
// "personaggio eliminato" (vedi `MissiveReader`).
export const missiveReceiverSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    avatar: z.string().nullable(),
    userName: z.string().nullable(),
    type: characterTypeEnum,
  })
  .nullable();

// Stessa forma di `missiveReceiverSchema`, ma non-nullable: un PG che ha
// letto una Comunicazione (`readByCharacterIds`) risolve sempre a un
// Character reale nel momento in cui viene incluso nell'elenco (vedi
// `readByCharacters` in `missiveDetailSchema` sotto) — un id che non
// risolve più viene scartato in silenzio dal repository, mai esposto come
// voce `null`.
export const missiveReadByCharacterSchema = z.object({
  id: z.number(),
  name: z.string(),
  avatar: z.string().nullable(),
  userName: z.string().nullable(),
  type: characterTypeEnum,
});

// `status` non è esposto: è sempre `"done"` per le missive (non passano mai
// dalla coda di approvazione, vedi `handlers/missive.ts`), quindi un valore
// costante che non aggiunge informazione.
export const missiveListItemSchema = z.object({
  id: z.number(),
  subject: z.string(),
  receiver: missiveReceiverSchema,
  sendDate: z.coerce.date(),
  sender: missiveSenderSchema,
  // `null` finché il destinatario non apre la missiva (badge Ricevuto/Letto
  // in `MissiveRow.tsx`) — impostato da `PATCH .../missive/[id]/read`.
  readDate: z.coerce.date().nullable(),
  // `true` per una missiva "Comunicazione" (`actionData.communication`):
  // discrimina server-side, mai dedotto lato client da `receiver === null`
  // (che vale anche per un destinatario eliminato, vedi `missiveReceiverSchema`).
  isCommunication: z.boolean(),
  // `true` per una missiva "Campo libero" (`actionData.receiverFreeText`):
  // stesso discriminante server-side di `isCommunication` — qui `receiver`
  // è sempre `null` (nessun `Character` destinatario), il client deve
  // controllare questo flag PRIMA di interpretarlo come "personaggio
  // eliminato".
  isFreeReceiver: z.boolean(),
  // `true` per una risposta di un PG rivolta al master (T-0xx, missive "a
  // nome del master" rispondibili): stesso principio di `isFreeReceiver` —
  // qui `receiver` è sempre `null` (nessun `Character` destinatario, il
  // destinatario è l'utente master), il client deve controllare questo
  // flag PRIMA di interpretarlo come "personaggio eliminato".
  isMasterReceiver: z.boolean(),
  // Testo libero del destinatario, `null` per le altre due varianti.
  receiverFreeText: z.string().nullable(),
  // Username del master autore di una missiva "a nome del master" (T-0xx,
  // tab "Tutte le missive"/`MissiveReader`): popolato SOLO per un viewer
  // master, mai per un giocatore — enforcement server-side, vedi
  // `resolveMasterSenderName` in `missive.repository.ts`.
  masterSenderName: z.string().nullable(),
  // `true` se questa riga è una RISPOSTA di un thread (T-0xx, "risposte alle
  // missive"): mai vero per Comunicazione/"a nome del master"/"Campo
  // libero", il thread esiste solo nel ramo reale. `MissiveRow.tsx` usa
  // questi due campi per puntare sempre all'URL canonico della missiva
  // radice (mai a quello della singola risposta) e per un'icona dedicata —
  // il `subject` di una risposta include già il prefisso "Re: " (calcolato
  // da `MissiveWriter` alla creazione, vedi `reply.rootSubject`), quindi il
  // client non deve anteporne un altro.
  isReply: z.boolean(),
  threadRootId: z.number().nullable(),
});

export type MissiveListItem = z.infer<typeof missiveListItemSchema>;

// Dettaglio (GET /api/campaigns/[campaignSlug]/missive/[id]): stessa forma
// della riga di lista, con in più il contenuto integrale (`description`,
// HTML da `FieldRichText`) e, solo per una Comunicazione vista dal master,
// l'elenco dei PG che l'hanno letta (`readByCharacters`, vuoto per le
// missive normali E per un viewer non-master — popolato server-side, mai
// filtrato lato client).
// Un messaggio del thread (T-0xx, "risposte alle missive"): stessa forma di
// una riga di lista, con in più il contenuto integrale (`description`,
// stesso trattamento di `missiveDetailSchema` sotto) — nessun `thread`
// annidato (un thread non contiene altri thread, la struttura è piatta:
// radice + N risposte, tutte allo stesso livello). Il ramo Comunicazione/
// "Campo libero" non hanno mai un thread (esiste solo nel ramo reale, vedi
// `getThreadReplies` in `missive.repository.ts`), quindi i loro campi
// (`receiverFreeText`, `masterSenderName`) restano sullo schema ma valgono
// sempre `null`/`false` per coerenza con `missiveListItemSchema` — non vale
// la pena un tipo separato solo per escluderli.
export const missiveThreadMessageSchema = missiveListItemSchema.extend({
  description: z.string(),
});

export type MissiveThreadMessage = z.infer<typeof missiveThreadMessageSchema>;

export const missiveDetailSchema = missiveListItemSchema.extend({
  description: z.string(),
  readByCharacters: z.array(missiveReadByCharacterSchema),
  // Il thread completo (radice ESCLUSA, vedi `getThreadReplies`): vuoto se
  // questa riga non è rispondibile (Comunicazione/"a nome del
  // master"/"Campo libero") o se non ha ancora ricevuto risposte.
  thread: z.array(missiveThreadMessageSchema),
});

export type MissiveDetail = z.infer<typeof missiveDetailSchema>;

export const missiveSenderOptionSchema = z.object({
  id: senderFilterSchema,
  name: z.string(),
  avatar: z.string().nullable(),
});

export type MissiveSenderOption = z.infer<typeof missiveSenderOptionSchema>;

export const missiveReceiverOptionSchema = z.object({
  id: z.number(),
  name: z.string(),
  avatar: z.string().nullable(),
  type: characterTypeEnum,
});

export type MissiveReceiverOption = z.infer<typeof missiveReceiverOptionSchema>;

export const missiveFilterOptionsSchema = z.object({
  senders: z.array(missiveSenderOptionSchema),
  receivers: z.array(missiveReceiverOptionSchema),
});

export type MissiveFilterOptions = z.infer<typeof missiveFilterOptionsSchema>;

export const missivePaginationSchema = z.object({
  page: z.number(),
  pageSize: z.number(),
  totalCount: z.number(),
  totalPages: z.number(),
});

export type MissivePagination = z.infer<typeof missivePaginationSchema>;

export const missiveListResponseSchema = z.object({
  missives: z.array(missiveListItemSchema),
  filterOptions: missiveFilterOptionsSchema,
  pagination: missivePaginationSchema,
  // Calcolato server-side (mai dedotto dal client con euristiche sui dati):
  // decide se mostrare la terza tab "Tutte le missive" (master-only, vedi
  // `missiveBoxEnum`) in `MissiveList.tsx`.
  viewerIsMaster: z.boolean(),
});

export type MissiveListResponse = z.infer<typeof missiveListResponseSchema>;

// Body di `PATCH .../missive/[id]` (T-0xx, "modifica missiva"): SOLO
// `description` — l'oggetto non è mai mostrato per un singolo messaggio del
// thread (solo per la radice, come titolo pagina), non ha senso esporlo in
// modifica qui. Il mittente può cambiare SOLO il contenuto, mai lo stato di
// lettura né alcun altro campo (`.strict()`) — la route verifica lato server
// che il chiamante sia davvero il mittente e che la missiva non sia già
// stata letta (vedi `updateMissiveContentIfUnread` in
// `missive.repository.ts`).
export const updateMissiveContentSchema = z
  .object({
    description: z.string().trim().min(1),
  })
  .strict();

export type UpdateMissiveContentInput = z.infer<
  typeof updateMissiveContentSchema
>;
