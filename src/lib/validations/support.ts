import { z } from "zod";
import { SUPPORT_TICKET_STATUSES } from "@/lib/support/status";

// "Supporto" (T-0xx): validazione ai bordi per le route `/api/support/tickets*`
// (vedi CLAUDE.md "Validazione ai bordi"). Gli id di stato vengono da
// `SUPPORT_TICKET_STATUSES` (fonte di verità unica, `lib/support/status.ts`),
// mai duplicati qui — stesso pattern di `downtimeStatusSchema`.
export const supportTicketStatusSchema = z.enum(SUPPORT_TICKET_STATUSES);

export type SupportTicketStatus = z.infer<typeof supportTicketStatusSchema>;

const SUBJECT_MAX_LENGTH = 200;

// Body di `POST /api/support/tickets`: `body` è HTML prodotto da
// `FieldRichText`, non ulteriormente validato nel contenuto (stesso
// trattamento di `missiveActionSchema.description`).
export const createSupportTicketSchema = z.object({
  subject: z.string().trim().min(1).max(SUBJECT_MAX_LENGTH),
  body: z.string().trim().min(1),
});

export type CreateSupportTicketInput = z.infer<
  typeof createSupportTicketSchema
>;

// Body di `POST /api/support/tickets/[id]/messages`.
export const addSupportMessageSchema = z.object({
  body: z.string().trim().min(1),
});

export type AddSupportMessageInput = z.infer<typeof addSupportMessageSchema>;

// Body di `PATCH /api/support/tickets/[id]/status`.
export const updateSupportTicketStatusSchema = z.object({
  status: supportTicketStatusSchema,
});

export type UpdateSupportTicketStatusInput = z.infer<
  typeof updateSupportTicketStatusSchema
>;

// Risposta di `GET /api/support/tickets`: specchia `SupportTicketListItem`
// (`support.repository.ts`). `author` è sempre presente (anche nella vista
// "i miei ticket", dove è sempre il viewer stesso) per condividere lo stesso
// schema fra le due viste — il client (staff vs proprietario) decide se
// mostrarlo.
export const supportTicketListItemSchema = z.object({
  id: z.number(),
  subject: z.string(),
  status: supportTicketStatusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  messageCount: z.number(),
  lastMessagePreview: z.string().nullable(),
  author: z.object({ name: z.string(), email: z.string() }),
});

export type SupportTicketListItemDto = z.infer<
  typeof supportTicketListItemSchema
>;

export const supportTicketListResponseSchema = z.object({
  tickets: z.array(supportTicketListItemSchema),
  // `true` quando il viewer è staff: la UI usa questo flag per decidere se
  // mostrare la colonna "autore" e i controlli di gestione del thread,
  // risolto server-side una volta sola invece che ridedotto dal client.
  isStaff: z.boolean(),
});

export type SupportTicketListResponse = z.infer<
  typeof supportTicketListResponseSchema
>;

// Risposta di `GET /api/support/tickets/[id]`: specchia
// `SupportTicketWithMessages` (`support.repository.ts`).
export const supportMessageDtoSchema = z.object({
  id: z.number(),
  body: z.string(),
  createdAt: z.coerce.date(),
  authorId: z.string(),
  authorName: z.string(),
  authorImage: z.string().nullable(),
  isStaffAuthor: z.boolean(),
});

export type SupportMessageDto = z.infer<typeof supportMessageDtoSchema>;

export const supportTicketDetailSchema = z.object({
  id: z.number(),
  subject: z.string(),
  status: supportTicketStatusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  messages: z.array(supportMessageDtoSchema),
  // `true` quando il viewer della sessione corrente è proprio il titolare
  // del ticket (mai lo staff, anche se lo staff è anche titolare di UN
  // altro ticket): decide lato client lo stile bolla mittente/destinatario,
  // stesso principio di `MissiveReader`.
  isOwnTicket: z.boolean(),
  isStaff: z.boolean(),
});

export type SupportTicketDetail = z.infer<typeof supportTicketDetailSchema>;
