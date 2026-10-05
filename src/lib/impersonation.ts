import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

interface SessionUser {
  id: string;
  name: string;
  email: string;
}

// Discriminated union: when `isImpersonating` is true, `adminUser` is guaranteed.
export type ImpersonationContext =
  | { isImpersonating: false; activeUser: SessionUser }
  | { isImpersonating: true; activeUser: SessionUser; adminUser: SessionUser };

/**
 * Legge la sessione corrente e, se è una sessione di impersonation avviata
 * dal plugin `admin` di Better Auth (T-010), risolve anche l'admin
 * originale.
 *
 * Prima di T-010 questa funzione ricostruiva l'impersonation a mano (secondo
 * cookie `better-auth.admin_session_token`, doppia chiamata a `getSession`)
 * scrivendo/leggendo un cookie di sessione non firmato — bug P0, rifiutato
 * da Better Auth a runtime. Ora si appoggia interamente al plugin:
 * `session.impersonatedBy`, valorizzato da `auth.api.impersonateUser`, è
 * l'unica fonte per sapere se la sessione attiva è impersonata e da chi.
 */
export async function getSessionContext(
  headers: Headers
): Promise<ImpersonationContext | null> {
  const activeSession = await auth.api.getSession({ headers });
  if (!activeSession?.user) {
    return null;
  }

  const activeUser: SessionUser = {
    id: activeSession.user.id,
    name: activeSession.user.name,
    email: activeSession.user.email,
  };

  const adminUserId = activeSession.session?.impersonatedBy;
  if (!adminUserId) {
    return { isImpersonating: false, activeUser };
  }

  const adminUser = await prisma.user.findUnique({
    where: { id: adminUserId },
    select: { id: true, name: true, email: true },
  });

  if (!adminUser) {
    // Stato inconsistente (l'admin dietro l'impersonation non è più
    // risolvibile): meglio negare l'accesso che esporre una sessione
    // impersonata senza un admin di riferimento.
    console.error(
      `[IMPERSONATION] adminUser non trovato per impersonatedBy id: ${adminUserId}`
    );
    return null;
  }

  return {
    isImpersonating: true,
    activeUser,
    adminUser,
  };
}
