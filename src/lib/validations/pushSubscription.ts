import { z } from "zod";

// Payload di `PushSubscription.toJSON()` (Push API standard), inviato dal
// client a `POST /api/push/subscribe` dopo `pushManager.subscribe()`.
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});
