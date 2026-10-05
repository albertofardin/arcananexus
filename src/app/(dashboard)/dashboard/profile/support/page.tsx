import { notFound } from "next/navigation";
import { headers } from "next/headers";
import SupportPage from "@/components/SupportPage";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getUserGroupFlags } from "@/lib/authorization";
import {
  listAllSupportTickets,
  listSupportTicketsForUser,
} from "@/lib/repositories/support.repository";

// Server Component (T-0xx, "Supporto"): fetch iniziale via repository
// (nessun round-trip client→API per il primo render, stesso pattern della
// pagina di dettaglio missiva) — le interazioni (apertura ticket, form)
// vivono nel Client Component `SupportPage`.
export default async function Page() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user) {
    notFound();
  }

  const flags = await getUserGroupFlags(prisma, session.user.id);
  const isStaff = flags?.isSviluppo === true;

  const tickets = isStaff
    ? await listAllSupportTickets(prisma)
    : await listSupportTicketsForUser(prisma, session.user.id);

  return <SupportPage tickets={tickets} isStaff={isStaff} />;
}
