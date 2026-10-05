import { z } from "zod";
import { characterTypeEnum } from "./character";
import { campaignColorEnum } from "./campaign";
import { DOWNTIME_STATUSES } from "@/lib/downtime/status";
import { CHARACTER_STATUSES } from "@/components/BadgeCharacterStatus/status";

// Risposta di `GET /api/notifications` (T-0xx, pannello notifiche — FASE 1
// backend, contratto consumato dalla FASE 2 UI): specchia `NotificationListItem`
// (`notification.repository.ts`), qui validata/serializzata all'edge come
// ogni altra risposta di route (vedi CLAUDE.md "Validazione ai bordi").
// Discriminata da `type`, stesso pattern di `anyMissiveActionSchema`.

const notificationBaseSchema = z.object({
  id: z.number(),
  read: z.boolean(),
  createdAt: z.coerce.date(),
});

// Solo per i tre tipi campaign-scoped: `support_new`/`support_reply`
// (T-0xx, "Supporto") non hanno una campagna, vedi `supportNotificationBaseSchema`.
const campaignNotificationBaseSchema = notificationBaseSchema.extend({
  campaignId: z.number(),
  campaignSlug: z.string(),
  campaignName: z.string(),
  campaignLogo: z.string().nullable(),
  campaignColor: campaignColorEnum,
});

const missiveNotificationSchema = campaignNotificationBaseSchema.extend({
  type: z.literal("missive"),
  actionId: z.number(),
  subject: z.string(),
  isCommunication: z.boolean(),
  isReply: z.boolean(),
  isMasterReceiver: z.boolean(),
  senderName: z.string(),
  senderAvatar: z.string().nullable(),
  receiverCharacterName: z.string().nullable(),
});

const characterReviewNotificationSchema = campaignNotificationBaseSchema.extend(
  {
    type: z.literal("character_status"),
    characterId: z.number(),
    characterName: z.string(),
    characterAvatar: z.string().nullable(),
    characterType: characterTypeEnum,
    ownerUserName: z.string(),
    isOwner: z.boolean(),
    status: z.enum(CHARACTER_STATUSES),
  }
);

const downtimeNotificationSchema = campaignNotificationBaseSchema.extend({
  type: z.literal("downtime"),
  actionId: z.number(),
  characterName: z.string(),
  characterAvatar: z.string().nullable(),
  categoryName: z.string(),
  subject: z.string(),
  isAuthor: z.boolean(),
  status: z.enum(DOWNTIME_STATUSES),
  response: z.string().nullable(),
});

const eventBookingNotificationSchema = campaignNotificationBaseSchema.extend({
  type: z.literal("event_booking"),
  eventId: z.number(),
  eventName: z.string(),
});

// `support_new`/`support_reply` (T-0xx, "Supporto"): unico caso non
// campaign-scoped, estende la base senza campagna.
const supportNewNotificationSchema = notificationBaseSchema.extend({
  type: z.literal("support_new"),
  ticketId: z.number(),
  subject: z.string(),
  authorName: z.string(),
});

const supportReplyNotificationSchema = notificationBaseSchema.extend({
  type: z.literal("support_reply"),
  ticketId: z.number(),
  subject: z.string(),
  authorName: z.string(),
});

// Buono ricevuto dal direttivo: nessuna campagna, come il "Supporto".
const voucherNotificationSchema = notificationBaseSchema.extend({
  type: z.literal("voucher"),
  amount: z.number(),
});

export const notificationListItemSchema = z.discriminatedUnion("type", [
  missiveNotificationSchema,
  characterReviewNotificationSchema,
  downtimeNotificationSchema,
  supportNewNotificationSchema,
  supportReplyNotificationSchema,
  eventBookingNotificationSchema,
  voucherNotificationSchema,
]);

export type NotificationListItemDto = z.infer<
  typeof notificationListItemSchema
>;

export const notificationListResponseSchema = z.object({
  notifications: z.array(notificationListItemSchema),
  unreadCount: z.number(),
});

export type NotificationListResponse = z.infer<
  typeof notificationListResponseSchema
>;
