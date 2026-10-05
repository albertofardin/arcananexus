import { createAuthClient } from "better-auth/react";
import type { auth } from "@/lib/auth";

export const authClient = createAuthClient();

// Con `strictNullChecks: false` (tsconfig di questo repo) l'inferenza
// generica di `authClient.useSession()` in Better Auth 1.7 collassa `data` a
// `never` (i tipi condizionali della libreria assumono strict null checks
// attivi). `auth.$Infer.Session` non ha lo stesso problema perché deriva dal
// tipo concreto della config server invece che dal default generico del
// client — lo riusiamo per ridare a `data` il tipo corretto. Import di solo
// tipo: nessun codice server (Prisma, adapter, ...) finisce nel bundle
// client.
type Session = typeof auth.$Infer.Session;

export const useSession = authClient.useSession as unknown as () => Omit<
  ReturnType<typeof authClient.useSession>,
  "data"
> & { data: Session | null };

export const {
  signIn,
  signUp,
  signOut,
  getSession,
  // T-046: recupero password. `requestPasswordReset` invia l'email con il
  // link (`sendResetPassword` in `src/lib/auth.ts`); `resetPassword` imposta
  // la nuova password dato il token ricevuto via link (vedi
  // `src/components/Login/LoginAccess.tsx`).
  requestPasswordReset,
  resetPassword,
  // T-047: reinvio email di verifica su richiesta esplicita dell'utente
  // (schermata "controlla la tua email" dopo la registrazione).
  sendVerificationEmail,
} = authClient;
