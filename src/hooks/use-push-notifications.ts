import * as React from "react";

// Formato richiesto da `PushManager.subscribe({ applicationServerKey })`:
// la chiave VAPID pubblica arriva come stringa base64url, l'API vuole un
// `Uint8Array` (snippet standard, vedi MDN "Sending and receiving push
// messages").
function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export type PushSupportStatus =
  "unsupported" | "checking" | "subscribed" | "available";

// Stato + azione per il pannello notifiche (T-0xx): `subscribed` è vero solo
// se ESISTE già una `PushSubscription` per questo browser/dispositivo
// (`pushManager.getSubscription()`), non solo se il permesso è concesso —
// un utente può aver concesso il permesso in passato senza mai aver
// completato la subscribe (es. VAPID non ancora configurato all'epoca).
export function usePushNotifications() {
  const [status, setStatus] = React.useState<PushSupportStatus>("checking");
  const [error, setError] = React.useState<string | null>(null);

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    !!vapidPublicKey;

  React.useEffect(() => {
    if (!supported) {
      setStatus("unsupported");
      return;
    }
    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js")
      .then(registration => registration.pushManager.getSubscription())
      .then(subscription => {
        if (!cancelled) setStatus(subscription ? "subscribed" : "available");
      })
      .catch(() => {
        if (!cancelled) setStatus("unsupported");
      });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const subscribe = React.useCallback(async () => {
    if (!vapidPublicKey) return;
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Permesso negato per le notifiche.");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!res.ok) throw new Error("Salvataggio subscription fallito");

      setStatus("subscribed");
    } catch {
      setError("Attivazione delle notifiche push non riuscita.");
    }
  }, [vapidPublicKey]);

  const unsubscribe = React.useCallback(async () => {
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setStatus("available");
        return;
      }

      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();

      setStatus("available");
    } catch {
      setError("Disattivazione delle notifiche push non riuscita.");
    }
  }, []);

  return { status, error, subscribe, unsubscribe };
}
