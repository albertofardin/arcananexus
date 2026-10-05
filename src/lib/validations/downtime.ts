import { z } from "zod";
import { DOWNTIME_STATUSES } from "@/lib/downtime/status";

export const DOWNTIME_PAGE_SIZE = 20;

// Stato di approvazione (T-0xx): id presi da `DOWNTIME_STATUSES` (fonte di
// verità unica, vedi `src/lib/downtime/status.ts`), mai duplicati qui.
export const downtimeStatusSchema = z.enum(DOWNTIME_STATUSES);

export type DowntimeStatus = z.infer<typeof downtimeStatusSchema>;

// Query di `GET .../downtime` (T-0xx): a differenza di `missiveListQuerySchema`
// non c'è alcuna sentinella "a nome del master" (un'`Action` downtime ha
// SEMPRE un `characterId`, vedi il repository) — `authorCharacterId` è
// quindi sempre un `Character.id` reale. `category` (T-0xx, fix catalogo
// globale) è la stringa libera salvata in `Action.actionData.category`, non
// più un `functionName` di una `FeatureType` dedicata.
export const downtimeListQuerySchema = z.object({
  authorCharacterId: z.coerce.number().int().positive().optional(),
  category: z.string().trim().min(1).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  search: z.string().trim().min(1).optional(),
  status: downtimeStatusSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
});

export type DowntimeListQuery = z.infer<typeof downtimeListQuerySchema>;

// Autore di una downtime: a differenza di `missiveSenderSchema` non è mai
// `null` (nessun equivalente "a nome del master" per il downtime).
export const downtimeAuthorSchema = z.object({
  id: z.number(),
  name: z.string(),
  avatar: z.string().nullable(),
  // Nome del giocatore proprietario del PG autore, se disponibile
  // (`character.user.name`).
  userName: z.string().nullable(),
});

export type DowntimeAuthor = z.infer<typeof downtimeAuthorSchema>;

export const downtimeListItemSchema = z.object({
  id: z.number(),
  // Titolo della downtime (T-0xx): mostrato in lista al posto della
  // descrizione completa, stesso identico campo/ruolo di
  // `missiveListItemSchema.subject`.
  subject: z.string(),
  author: downtimeAuthorSchema,
  // Categoria scelta (T-0xx, fix catalogo globale): stringa libera salvata
  // in `Action.actionData.category`, non più una `FeatureType` dedicata —
  // può cambiare/scomparire dalla configurazione senza invalidare azioni
  // storiche già dichiarate con quel nome.
  category: z.string(),
  creationDate: z.coerce.date(),
  // `null` finché nessun master apre il dettaglio (badge Aperta/Non letta in
  // `DowntimeRow.tsx`) — impostato da `PATCH .../downtime/[id]/read`.
  readDate: z.coerce.date().nullable(),
  // Stato di approvazione (T-0xx): `"waiting"` finché il master non lo
  // cambia — impostato da `PATCH .../downtime/[id]/status`.
  status: downtimeStatusSchema,
});

export type DowntimeListItem = z.infer<typeof downtimeListItemSchema>;

// Dettaglio (GET /api/campaigns/[campaignSlug]/downtime/[id]): stessa forma
// della riga di lista, con in più il contenuto integrale (`description`,
// HTML da `FieldRichText`) e l'eventuale risposta del master (`response`,
// stesso HTML da `FieldRichText`, `null` finché nessuna risposta è stata
// salvata — non esposta in lista, non serve alla riga). Niente equivalente
// di "Letta da" (specifico delle missive Comunicazione, che non esiste per
// il downtime): un solo `readDate`, non un array.
export const downtimeDetailSchema = downtimeListItemSchema.extend({
  description: z.string(),
  response: z.string().nullable(),
  // Nota riservata (T-0xx): stesso meccanismo di `response`, ma MAI esposta
  // a un giocatore — il chiamante (route GET di dettaglio) deve azzerarla a
  // `null` quando `isMaster` è `false`, prima di passare per questo schema.
  masterNote: z.string().nullable(),
  // `null` finché il master non ha mai modificato la downtime (stato e/o
  // risposta) — impostata da `PATCH .../downtime/[id]/status` a ogni
  // chiamata (a differenza di `readDate`, non è idempotente: si aggiorna
  // anche quando il master ripete l'operazione più volte).
  updateDate: z.coerce.date().nullable(),
});

export type DowntimeDetail = z.infer<typeof downtimeDetailSchema>;

export const downtimeAuthorOptionSchema = z.object({
  id: z.number(),
  name: z.string(),
  avatar: z.string().nullable(),
});

export type DowntimeAuthorOption = z.infer<typeof downtimeAuthorOptionSchema>;

export const downtimeFilterOptionsSchema = z.object({
  authors: z.array(downtimeAuthorOptionSchema),
  categories: z.array(z.string()),
});

export type DowntimeFilterOptions = z.infer<typeof downtimeFilterOptionsSchema>;

export const downtimePaginationSchema = z.object({
  page: z.number(),
  pageSize: z.number(),
  totalCount: z.number(),
  totalPages: z.number(),
});

export type DowntimePagination = z.infer<typeof downtimePaginationSchema>;

export const downtimeListResponseSchema = z.object({
  downtimes: z.array(downtimeListItemSchema),
  filterOptions: downtimeFilterOptionsSchema,
  pagination: downtimePaginationSchema,
});

export type DowntimeListResponse = z.infer<typeof downtimeListResponseSchema>;

// Body di `PATCH .../downtime/[id]/status` (T-0xx): `response`/`masterNote`
// sono opzionali (il master può cambiare solo lo stato) — quando assenti/
// vuoti vengono salvati come `null`, MAI preservati da un valore precedente:
// il chiamante (`DowntimeMasterEditor.tsx`) invia sempre il contenuto
// corrente di entrambi i campi, precompilati con i valori esistenti — vedi
// `updateDowntimeStatus`.
export const updateDowntimeStatusSchema = z
  .object({
    status: downtimeStatusSchema,
    response: z.string().trim().optional(),
    // Nota riservata (T-0xx): stessa semantica opzionale di `response`, ma
    // mai mostrata al giocatore autore — solo ad altri master (vedi
    // `DowntimeReader.tsx`).
    masterNote: z.string().trim().optional(),
  })
  .strict();

export type UpdateDowntimeStatusInput = z.infer<
  typeof updateDowntimeStatusSchema
>;
