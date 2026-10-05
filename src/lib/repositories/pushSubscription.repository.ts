import type { PrismaClient, PushSubscription } from "@prisma/client";

export interface SaveSubscriptionInput {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

// `endpoint` è unico per dispositivo/browser (schema.prisma): un
// `subscribe()` ripetuto sullo stesso dispositivo (es. permesso già
// concesso, hook rimontato) aggiorna le chiavi invece di duplicare la riga.
export async function saveSubscription(
  prisma: PrismaClient,
  { userId, endpoint, p256dh, auth }: SaveSubscriptionInput
): Promise<PushSubscription> {
  return prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId, endpoint, p256dh, auth },
    update: { userId, p256dh, auth },
  });
}

export async function deleteSubscriptionByEndpoint(
  prisma: PrismaClient,
  endpoint: string
): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

// Scopata anche a `userId` (a differenza di `deleteSubscriptionByEndpoint`,
// usata solo dalla pulizia server-side di `sendPush`): un utente non deve
// poter disiscrivere l'endpoint di un altro anche se lo indovinasse —
// stesso principio di `markNotificationRead`.
export async function deleteSubscriptionForUser(
  prisma: PrismaClient,
  { userId, endpoint }: { userId: string; endpoint: string }
): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

export async function listSubscriptionsForUser(
  prisma: PrismaClient,
  userId: string
): Promise<PushSubscription[]> {
  return prisma.pushSubscription.findMany({ where: { userId } });
}
