import z from "zod";

export const characterTypeEnum = z.enum(["pg", "png"]);

export const characterSchema = z.object({
  id: z.number(),
  campaignId: z.number(),
  userId: z.string(),
  type: characterTypeEnum.default("pg"),
  name: z.string(),
  avatar: z.string().nullable().optional(),
  background: z.string(),
  creationDate: z.coerce.date(),
  approvalDate: z.coerce.date().nullable().optional(),
  deathDate: z.coerce.date().nullable().optional(),
  parkDate: z.coerce.date().nullable().optional(),
  playerNotes: z.string().nullable().optional(),
  masterPublicNotes: z.string().nullable().optional(),
  masterNotes: z.string().nullable().optional(),
  downtimePoints: z.number().int().default(0),
  missivePoints: z.number().int().default(0),
  lastUpdateDate: z.coerce.date(),
  // Optional fields for display
  campaignName: z.string().optional(),
  campaignSlug: z.string().optional(),
  orgSlug: z.string().optional(),
  userName: z.string().optional(),
  userImage: z.string().nullable().optional(),
});

export type Character = z.infer<typeof characterSchema>;

// Fields only campaign staff (admin/helper grant) may change; owners are limited to the rest.
export const CHARACTER_STAFF_ONLY_FIELDS = [
  "type",
  "masterNotes",
  "masterPublicNotes",
  "approvalDate",
  "deathDate",
  "parkDate",
  "downtimePoints",
  "missivePoints",
] as const;

// In update il nome è riservato allo staff: il giocatore lo sceglie solo alla creazione.
export const CHARACTER_STAFF_ONLY_UPDATE_FIELDS = [
  ...CHARACTER_STAFF_ONLY_FIELDS,
  "name",
] as const;

// Esportato: riusato da `characterCreation.ts` (T-018), che compone la
// stessa forma di campi base con la lista di assegnazioni di catalogo.
export const characterEditableFields = z.object({
  name: z.string().trim().min(1).max(200),
  background: z.string().max(20000),
  type: characterTypeEnum,
  playerNotes: z.string().max(20000).nullable(),
  masterPublicNotes: z.string().max(20000).nullable(),
  masterNotes: z.string().max(20000).nullable(),
  approvalDate: z.coerce.date().nullable(),
  deathDate: z.coerce.date().nullable(),
  parkDate: z.coerce.date().nullable(),
  // `coerce`: come le date sopra, la scheda invia il campo come stringa
  // (stesso pattern di `FieldText`/`buildFeatureDataPayload` in `features.ts`).
  downtimePoints: z.coerce.number().int().min(0),
  missivePoints: z.coerce.number().int().min(0),
});

export const updateCharacterSchema = characterEditableFields
  .partial()
  .strict()
  .refine(data => Object.keys(data).length > 0, {
    message: "Nessun campo da aggiornare",
  });

export type UpdateCharacterInput = z.infer<typeof updateCharacterSchema>;

// Body di `POST .../characters/downtime-recharge` (ricarica bulk, master):
// importo da aggiungere al saldo `downtimePoints` di ogni personaggio della
// campagna.
export const downtimeRechargeSchema = z
  .object({
    amount: z.number().int().positive(),
  })
  .strict();

export type DowntimeRechargeInput = z.infer<typeof downtimeRechargeSchema>;

// Body di `POST /api/characters/[id]/xp-update` (master, T-0xx): aggiorna il
// saldo XP di un singolo PG già esistente (`CharacterEditor.tsx`),
// stesso meccanismo di `xp.service.updateXp` usato in creazione PG e
// nell'assegnazione bulk admin. Un importo zero non ha senso (nulla da
// registrare in cronologia), come anche in `xpGrantSchema`.
export const characterXpUpdateSchema = z
  .object({
    amount: z
      .number()
      .int()
      .refine(v => v !== 0, "L'importo non può essere zero"),
  })
  .strict();

export type CharacterXpUpdateInput = z.infer<typeof characterXpUpdateSchema>;

// Body di `POST .../characters/xp-grant` (aggiornamento bulk XP, master): un
// unico importo applicato ai personaggi (PG o PNG, con status attivo
// "approved") selezionati con le checkbox nell'UI (`CampaignProgress.tsx`,
// `admin/xp-update`). Nessun vincolo di segno sull'importo: è un
// aggiornamento manuale (`xp.service.updateXp`), può anche essere negativo.
// Un importo zero è rifiutato: non c'è nulla da registrare in cronologia
// (a differenza del vecchio `defaultAmount`, qui non è più un no-op
// silenzioso su un intero elenco, ma l'unico importo dell'intera azione).
export const xpGrantSchema = z
  .object({
    amount: z
      .number()
      .int()
      .refine(v => v !== 0, "L'importo non può essere zero"),
    characterIds: z.array(z.number().int().positive()).min(1),
    // Motivazione facoltativa, mostrata in cronologia XP di ogni personaggio
    // coinvolto (`ModalXpHistory.tsx`) accanto al nome
    // del master.
    note: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type XpGrantInput = z.infer<typeof xpGrantSchema>;

export const createCharacterSchema = characterEditableFields
  .partial()
  .extend({
    campaignSlug: z.string().min(1),
    name: z.string().trim().min(1).max(200),
  })
  .strict();

export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;

export const EMPTY_INSTANCE: Character = {
  id: 0,
  campaignId: 0,
  userId: "",
  type: "pg",
  name: "Nuovo Personaggio",
  background: "",
  creationDate: new Date(),
  approvalDate: null,
  deathDate: null,
  parkDate: null,
  playerNotes: null,
  masterPublicNotes: null,
  masterNotes: null,
  downtimePoints: 0,
  missivePoints: 0,
  lastUpdateDate: new Date(),
  campaignName: "",
  userName: "",
};

// Schema for character detail page with relations
export const characterDetailSchema = z.object({
  id: z.number(),
  campaignId: z.number(),
  userId: z.string(),
  type: characterTypeEnum,
  name: z.string(),
  avatar: z.string().nullable().optional(),
  background: z.string().nullable(),
  creationDate: z.coerce.date(),
  approvalDate: z.coerce.date().nullable().optional(),
  deathDate: z.coerce.date().nullable().optional(),
  parkDate: z.coerce.date().nullable().optional(),
  playerNotes: z.string().nullable().optional(),
  masterPublicNotes: z.string().nullable().optional(),
  masterNotes: z.string().nullable().optional(),
  downtimePoints: z.number().int().default(0),
  missivePoints: z.number().int().default(0),
  lastUpdateDate: z.coerce.date().nullable().optional(),

  // Relations for detail page
  campaign: z.object({
    id: z.number(),
    name: z.string(),
    slug: z.string(),
    organization: z.object({
      slug: z.string(),
    }),
  }),
  user: z.object({
    id: z.string(),
    name: z.string(),
  }),
  bookings: z
    .array(
      z.object({
        id: z.number(),
        bookingDate: z.coerce.date(),
        paymentDate: z.coerce.date().nullable().optional(),
        present: z.boolean().nullable().optional(),
        event: z.object({
          id: z.number(),
          name: z.string(),
          dateEventStart: z.coerce.date(),
          place: z.string().nullable(),
        }),
      })
    )
    .default([]),
});

export type CharacterDetail = z.infer<typeof characterDetailSchema>;
