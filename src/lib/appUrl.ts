// Estratto da `resolvedBaseUrl` in `src/lib/auth.ts` (stessa identica
// logica): vive qui perché moduli come `notification.repository.ts`/
// `src/lib/email/notificationEmail.ts` devono costruire link assoluti senza
// importare `auth.ts` per intero — quell'import farebbe girare
// l'inizializzazione completa di `betterAuth()` a import-time, che richiede
// env var (BETTER_AUTH_SECRET...) non sempre presenti nei test.
export function getAppBaseUrl(): string {
  const url =
    process.env.BETTER_AUTH_URL ??
    process.env.DEPLOY_PRIME_URL ??
    "http://localhost:3000";
  return url.replace(/\/+$/, "");
}
