import z from "zod";
import { campaignColorEnum } from "@/lib/validations/campaign";

// Label per gli eventi senza campagna (dell'associazione, es. piscinate,
// ritrovi): unica fonte condivisa da EventWriter e dal filtro di EventList.
export const NO_CAMPAIGN_LABEL = "Arcana Domine (evento associativo)";

// Sottoinsieme filtrabile di EventStatus (vedi components/EventList/status.ts).
export const eventStatusFilterEnum = z.enum([
  "open",
  "closed",
  "past",
  "upcoming",
]);
export type EventStatusFilter = z.infer<typeof eventStatusFilterEnum>;

// Direzione di ordinamento per `GET /api/events` (`?sort=`): il widget
// "Prossimi eventi" della dashboard la usa esplicitamente ("asc", i più
// imminenti prima); ogni altro chiamante che non la passa mantiene il
// default "desc" di `listPublishedEvents`.
export const eventSortDirectionEnum = z.enum(["asc", "desc"]);
export type EventSortDirection = z.infer<typeof eventSortDirectionEnum>;

// Stessi valori di `DataVisibility` (Prisma): `hidden` = solo staff/gestori.
export const eventVisibilitySchema = z.enum(["visible", "hidden"]);
export type EventVisibility = z.infer<typeof eventVisibilitySchema>;

// Quota alternativa opzionale (es. "quota ridotta bambini"): in iscrizione
// l'utente sceglie `Event.price` oppure una di queste, mai entrambe.
export const eventPaymentOptionSchema = z.object({
  label: z.string().trim().min(1, "La descrizione è obbligatoria").max(200),
  amount: z.coerce
    .number()
    .min(0.01, "L'importo deve essere maggiore di zero")
    .max(10_000),
});

export type EventPaymentOptionInput = z.infer<typeof eventPaymentOptionSchema>;

export const eventPaymentOptionDetailSchema = eventPaymentOptionSchema.extend({
  id: z.number(),
});

export type EventPaymentOptionDetail = z.infer<
  typeof eventPaymentOptionDetailSchema
>;

export const eventSchema = z.object({
  id: z.number(),
  name: z.string(),
  place: z.string(),
  dateEventStart: z.coerce.date(),
  datePublicationStart: z.coerce.date(),
  datePublicationEnd: z.coerce.date(),
  dateEventEnd: z.coerce.date(),
  price: z.coerce.number().optional(),
  image: z.string().nullable().optional(),
  visibility: eventVisibilitySchema.optional(),
  campaignName: z.string().nullable().optional(),
  campaignSlug: z.string().nullable().optional(),
  campaignColor: campaignColorEnum.nullable().optional(),
  campaignLogo: z.string().nullable().optional(),
  bookingCount: z.number().optional().default(0),
});

export type Event = z.infer<typeof eventSchema>;

export const EMPTY_INSTANCE: Event = {
  id: 0,
  name: "New Beginnings",
  place: "Kingdom of Light",
  dateEventStart: new Date("2025-10-15"),
  dateEventEnd: new Date("2025-10-16"),
  datePublicationEnd: new Date("2025-09-15"),
  datePublicationStart: new Date("2025-06-01"),
  campaignName: "Campaign 1",
  bookingCount: 8,
};

export const eventListResponseSchema = z.object({
  events: z.array(eventSchema),
  pagination: z.object({
    page: z.number(),
    pageSize: z.number(),
    totalCount: z.number(),
    totalPages: z.number(),
  }),
});

export type EventListResponse = z.infer<typeof eventListResponseSchema>;

// Risposta di `GET .../events/current` (master, admin/progress T-0xx):
// riepilogo minimo dell'evento "corrente" della campagna (vedi
// `getCurrentEventForCampaign`), solo per decidere se mostrare un link
// diretto all'evento o un placeholder "crea nuovo evento" — nessun campo in
// più di quelli davvero usati dalla card.
export const campaignCurrentEventSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    dateEventStart: z.coerce.date(),
  })
  .nullable();

export type CampaignCurrentEvent = z.infer<typeof campaignCurrentEventSchema>;

export const eventDetailSchema = z.object({
  id: z.number(),
  name: z.string(),
  place: z.string().nullable(),
  image: z.string().nullable(),
  description: z.string(),
  dateEventStart: z.coerce.date(),
  datePublicationStart: z.coerce.date(),
  datePublicationEnd: z.coerce.date(),
  dateEventEnd: z.coerce.date(),
  price: z.number().default(0),
  visibility: eventVisibilitySchema.default("visible"),
  // `null` = evento dell'associazione non legato a una campagna.
  campaign: z
    .object({
      id: z.number(),
      name: z.string(),
      slug: z.string(),
      color: campaignColorEnum.nullable(),
      logo: z.string().nullable(),
    })
    .nullable(),
  bookingCount: z.number().default(0),
  socials: z
    .array(
      z.object({
        link: z.string(),
        icon: z.string().nullable(),
      })
    )
    .optional()
    .default([]),
  paymentOptions: z
    .array(eventPaymentOptionDetailSchema)
    .optional()
    .default([]),
});

export type EventDetail = z.infer<typeof eventDetailSchema>;

// Input di POST/PATCH `/api/events`. `campaignSlug` nullo/assente = evento
// dell'associazione senza campagna. Le date arrivano come ISO string dal form.
export const eventWriteSchema = z
  .object({
    name: z.string().trim().min(1, "Il titolo è obbligatorio").max(200),
    image: z.string().url().nullable().optional(),
    description: z
      .string()
      .trim()
      .min(1, "La descrizione è obbligatoria")
      .max(100_000),
    place: z.string().trim().min(1, "Il luogo è obbligatorio").max(300),
    dateEventStart: z.coerce.date(),
    dateEventEnd: z.coerce.date(),
    datePublicationStart: z.coerce.date(),
    datePublicationEnd: z.coerce.date(),
    price: z.coerce
      .number()
      .min(0, "Il prezzo non può essere negativo")
      .max(10_000),
    visibility: eventVisibilitySchema.default("visible"),
    campaignSlug: z.string().nullable().optional(),
    paymentOptions: z
      .array(eventPaymentOptionSchema)
      .max(10, "Massimo 10 opzioni di pagamento")
      .optional()
      .default([]),
  })
  .superRefine((value, ctx) => {
    if (value.dateEventEnd < value.dateEventStart) {
      ctx.addIssue({
        code: "custom",
        path: ["dateEventEnd"],
        message: "La fine dell'evento deve essere dopo l'inizio",
      });
    }
    if (value.datePublicationEnd < value.datePublicationStart) {
      ctx.addIssue({
        code: "custom",
        path: ["datePublicationEnd"],
        message: "La chiusura iscrizioni deve essere dopo l'apertura",
      });
    }
    if (value.datePublicationEnd > value.dateEventEnd) {
      ctx.addIssue({
        code: "custom",
        path: ["datePublicationEnd"],
        message: "Le iscrizioni devono chiudere prima della fine dell'evento",
      });
    }
  });

export type EventWriteInput = z.infer<typeof eventWriteSchema>;

// Nota libera e opzionale del giocatore in iscrizione (es. "mi serve una
// spada", "solo gluten free").
const bookingNoteSchema = z
  .string()
  .trim()
  .max(500, "La nota può contenere al massimo 500 caratteri")
  .nullable()
  .optional();

// Iscrizione (POST `/api/events/[id]/register`): `characterId` solo per gli
// eventi di campagna.
export const eventRegisterSchema = z.object({
  characterId: z.number().int().positive().nullable().optional(),
  // Solo eventi a pagamento: come verrà approvato l'ordine PayPal.
  method: z.enum(["paypal", "card"]).optional(),
  // Quota scelta tra le opzioni di pagamento dell'evento; assente = quota base (`Event.price`).
  paymentOptionId: z.number().int().positive().nullable().optional(),
  note: bookingNoteSchema,
});

// Cattura (POST `/api/events/[id]/paypal/capture`) dell'ordine già approvato.
export const eventCaptureSchema = z.object({
  orderId: z.string().min(1),
  characterId: z.number().int().positive().nullable().optional(),
  // Quota scelta (come in `eventRegisterSchema`): serve a ricavare la parte pagata con i buoni.
  paymentOptionId: z.number().int().positive().nullable().optional(),
  note: bookingNoteSchema,
});

// Aggiunta gratuita di un personaggio giocatore (POST `/api/events/[id]/players`).
export const eventPlayerSchema = z.object({
  characterId: z.number().int().positive(),
  // Se `true`, il giocatore riceve la notifica (pannello + email).
  notify: z.boolean().default(false),
});

// Aggiunta gratuita di un membro staff (POST `/api/events/[id]/staff`).
export const eventStaffSchema = z.object({
  userId: z.string().min(1),
  notify: z.boolean().default(false),
});
