import webpush from "web-push";
import type { PrismaClient, PushSubscription } from "@prisma/client";
import { deleteSubscriptionByEndpoint } from "@/lib/repositories/pushSubscription.repository";

// Configurato una sola volta a import-time: le tre env var sono lette da
// `.env` (vedi `.template_env`), generate con `bunx web-push
// generate-vapid-keys`. Se mancano (checkout senza push configurato), le
// chiamate a `sendPush` falliscono in silenzio (vedi sotto) invece di far
// crashare l'app: il push è un side-effect opzionale, mai un requisito per
// il resto del prodotto.
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT;

if (vapidPublicKey && vapidPrivateKey && vapidSubject) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

// Usato da `notifyPush` (`notification.repository.ts`) per saltare a costo
// zero l'intero fan-out push (nessuna query, nessuna chiamata di rete)
// quando il progetto non ha le VAPID key configurate — checkout locale
// senza `.env` completo, o test (che non caricano `.env` reale).
export function isPushConfigured(): boolean {
  return !!(vapidPublicKey && vapidPrivateKey && vapidSubject);
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
  unreadCount: number;
}

// Invio best-effort a UNA subscription: mai lanciata, il chiamante
// (`notifyPush` in `notification.repository.ts`) fa fan-out fire-and-forget
// su più subscription/utenti e un fallimento di rete su una non deve mai far
// fallire le altre né la scrittura che ha generato la notifica.
// Endpoint scaduto/revocato (410 Gone, o 404) → la subscription non è più
// valida: viene ripulita subito, altrimenti resterebbe a fallire per sempre
// a ogni notifica futura.
export async function sendPush(
  prisma: PrismaClient,
  subscription: PushSubscription,
  payload: PushPayload
): Promise<void> {
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) return;

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload)
    );
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await deleteSubscriptionByEndpoint(prisma, subscription.endpoint);
      return;
    }
    console.error("Push notification failed:", error);
  }
}
