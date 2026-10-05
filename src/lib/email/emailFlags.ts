// Interruttori hardcoded per debug/sviluppo: metti `false` per non inviare
// più quel tipo di email (l'invio viene saltato in silenzio).

// Email di autenticazione (Better Auth, `src/lib/auth.ts`).
export const EMAIL_RESET_PASSWORD = true;
// Verifica registrazione e cambio email (stessa callback).
export const EMAIL_VERIFICATION = true;

// Email di notifica (`notifyEmail` in `notification.repository.ts`).
export const EMAIL_NOTIFICATION_SUPPORT = false;
export const EMAIL_NOTIFICATION_MISSIVE = false;
export const EMAIL_NOTIFICATION_DOWNTIME = false;
export const EMAIL_NOTIFICATION_CHARACTER_STATUS = false;
export const EMAIL_NOTIFICATION_EVENT_BOOKING = false;
export const EMAIL_NOTIFICATION_VOUCHER = true;
