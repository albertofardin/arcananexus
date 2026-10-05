// Service worker minimo per le notifiche Web Push (T-0xx). Nessun caching
// applicativo: la PWA resta installabile/riceve push, ma non serve offline —
// aggiungerlo sarebbe un problema in più (cache stantia) senza un bisogno
// reale oggi.

// Attiva subito ogni nuova versione (T-0xx): senza questi due, un utente con
// la PWA già installata resta sulla versione precedente del SW finché non
// chiude DAVVERO tutte le finestre/schede controllate da quella — cosa rara
// per un'app installata su mobile. Innocuo qui: questo SW non gestisce
// cache/fetch, "subentrare subito" non rischia di servire risposte stantie.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event =>
  event.waitUntil(self.clients.claim())
);

self.addEventListener("push", event => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const { title, body, url, tag, unreadCount } = payload;

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title ?? "Arcana Domine", {
        body,
        tag,
        // `icon`: immagine a colori mostrata nel corpo della notifica
        // espansa. `badge`: silhouette bianca su trasparente per la status
        // bar Android — Chrome legge SOLO il canale alpha, un'icona a colori
        // e opaca (come `icon-192.png`) non produce una forma riconoscibile
        // lì, da cui questo file dedicato generato da `_original.png`.
        icon: "/mobile/icon-192.png",
        badge: "/mobile/badge-96.png",
        data: { url: url ?? "/dashboard" },
      });

      // Badge numerico sull'icona app (T-0xx): solo Android/Chrome supporta
      // l'API dentro un service worker oggi, per questo il controllo di
      // feature-detection — su iOS il badge resta gestito lato client dal
      // poll di `useNotifications` (vedi `BtnNotifications.tsx`).
      if ("setAppBadge" in self.navigator && typeof unreadCount === "number") {
        if (unreadCount > 0) {
          await self.navigator.setAppBadge(unreadCount).catch(() => {});
        } else {
          await self.navigator.clearAppBadge?.().catch(() => {});
        }
      }
    })()
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/dashboard";

  event.waitUntil(
    (async () => {
      const windows = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = windows.find(w => w.url.includes(url));
      if (existing) {
        await existing.focus();
        return;
      }
      await clients.openWindow(url);
    })()
  );
});
