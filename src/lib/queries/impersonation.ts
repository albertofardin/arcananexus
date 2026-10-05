import { queryOptions, useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import {
  impersonationStatusSchema,
  startImpersonationResponseSchema,
  type ImpersonationStatus,
  type StartImpersonationResponse,
} from "@/lib/validations/impersonation";

// Intervallo di polling dello stato di impersonation: la barra deve comparire
// (o sparire, allo scadere della sessione) senza dover ricaricare la pagina.
const STATUS_POLL_INTERVAL_MS = 15_000;

const fetchImpersonationStatus = async (): Promise<ImpersonationStatus> => {
  const res = await fetch("/api/admin/impersonate/status");
  if (!res.ok) throw new Error("Failed to load impersonation status");
  return impersonationStatusSchema.parse(await res.json());
};

export const useQueryImpersonationStatus = () =>
  useQuery(
    queryOptions({
      queryKey: ["impersonation", "status"] as const,
      queryFn: fetchImpersonationStatus,
      refetchInterval: STATUS_POLL_INTERVAL_MS,
    })
  );

// Avvia l'impersonazione di `targetUserId` (solo super-admin, il backend
// rifiuta self-impersonation e utenti non super-admin con 400/403).
export const startImpersonation = async (
  targetUserId: string
): Promise<StartImpersonationResponse> => {
  const res = await fetch("/api/admin/impersonate/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetUserId }),
  });
  if (!res.ok) throw new Error("Failed to start impersonation");
  const parsed = startImpersonationResponseSchema.parse(await res.json());
  // Il cookie di sessione è cambiato lato server, ma useSession() è un
  // nanostore client che non se ne accorge da solo (fetch una tantum al
  // mount): va forzato il refetch, altrimenti nome/avatar restano quelli
  // dell'admin finché non si ricarica la pagina o la finestra riprende focus.
  authClient.$store.notify("$sessionSignal");
  return parsed;
};

// Ripristina la sessione dell'admin originale.
export const endImpersonation = async (): Promise<void> => {
  const res = await fetch("/api/admin/impersonate/end", { method: "POST" });
  if (!res.ok) throw new Error("Failed to end impersonation");
  // Stesso motivo di startImpersonation: forza il refetch di useSession().
  authClient.$store.notify("$sessionSignal");
};
