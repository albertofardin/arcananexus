import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  notificationListResponseSchema,
  type NotificationListResponse,
} from "@/lib/validations/notification";

const fetchNotifications = async (): Promise<NotificationListResponse> => {
  const res = await fetch("/api/notifications");
  if (!res.ok) throw new Error("Failed to load notifications");
  return notificationListResponseSchema.parse(await res.json());
};

// Intervallo di polling del pannello notifiche: stesso principio del polling
// di 15s per lo stato di impersonation (`useQueryImpersonationStatus`), qui
// più largo perché meno urgente — nessun redirect di sessione in gioco, il
// pallino/badge non lette può aggiornarsi con qualche secondo di ritardo
// senza impatto percepibile.
const NOTIFICATIONS_POLL_INTERVAL_MS = 30_000;

export const useNotifications = () =>
  useQuery(
    queryOptions({
      queryKey: ["notifications"] as const,
      queryFn: fetchNotifications,
      refetchInterval: NOTIFICATIONS_POLL_INTERVAL_MS,
    })
  );

// Segna una notifica come letta. Il chiamante (`BtnNotifications`) non
// attende la risposta per navigare: invalida `["notifications"]` dopo il
// successo così badge/pallino si aggiornano al prossimo giro di render.
export const markNotificationRead = async (id: number): Promise<void> => {
  const res = await fetch(`/api/notifications/${id}/read`, {
    method: "PATCH",
  });
  if (!res.ok) throw new Error("Failed to mark notification as read");
};

// Bottone "Segna tutte come lette" nel pannello: stessa forma di
// `markNotificationRead`, il chiamante invalida `["notifications"]` dopo il
// successo.
export const markAllNotificationsRead = async (): Promise<void> => {
  const res = await fetch("/api/notifications/read-all", { method: "PATCH" });
  if (!res.ok) throw new Error("Failed to mark all notifications as read");
};

// Bottone "Elimina tutte" nel pannello: stessa forma di
// `markAllNotificationsRead`, il chiamante invalida `["notifications"]` dopo
// il successo.
export const deleteAllNotifications = async (): Promise<void> => {
  const res = await fetch("/api/notifications", { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete all notifications");
};
