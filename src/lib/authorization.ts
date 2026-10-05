import { cache } from "react";
import { PrismaClient, Role, type Campaign } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isHardcodedSviluppo } from "@/lib/constants";

// Ri-esportate per compatibilità con i moduli che le importavano da qui
// prima che venissero spostate in `@/lib/constants` (serve anche lato
// client, per RoleManager — vedi il commento lì).
export {
  HARDCODED_SVILUPPO_EMAILS,
  isHardcodedSviluppo,
} from "@/lib/constants";

// Gerarchia dei ruoli di campagna, dal più al meno privilegiato.
// head_master ⊇ master ⊇ supporter: un ruolo più alto soddisfa anche i requisiti
// dei ruoli sottostanti.
const ROLE_RANK: Record<Role, number> = {
  [Role.head_master]: 3,
  [Role.master]: 2,
  [Role.supporter]: 1,
};

export async function checkCampaignAccess(
  prisma: PrismaClient,
  userId: string,
  campaignId: number,
  requiredRole?: Role
): Promise<boolean> {
  const grant = await prisma.grant.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
  });

  if (!grant) return false;
  if (!requiredRole) return true;
  return ROLE_RANK[grant.role] >= ROLE_RANK[requiredRole];
}

export async function getUserAccessibleCampaigns(
  prisma: PrismaClient,
  userId: string
): Promise<number[]> {
  const grants = await prisma.grant.findMany({
    where: { userId },
    select: { campaignId: true },
  });

  return grants.map(g => g.campaignId);
}

export async function isUserCampaignAdmin(
  prisma: PrismaClient,
  userId: string,
  campaignId: number
): Promise<boolean> {
  return checkCampaignAccess(prisma, userId, campaignId, Role.head_master);
}

// `cache()` (React, dedup per-request): la scheda personaggio chiama questo
// controllo sia dalla guardia di layout sia da `getCharacterEditorData` con
// lo stesso `userId`/`campaignId` — evita un secondo giro sulla stessa
// `Grant` nella stessa request (stesso pattern di `getCharacterByIdScoped`).
export const isUserCampaignMaster = cache(async function isUserCampaignMaster(
  prisma: PrismaClient,
  userId: string,
  campaignId: number
): Promise<boolean> {
  // `Role.master` copre già `head_master` (rank più alto, vedi ROLE_RANK):
  // il secondo controllo esplicito su `head_master` sarebbe comunque
  // ridondante.
  return checkCampaignAccess(prisma, userId, campaignId, Role.master);
});

// Prima che una campagna esista non c'è ancora un Grant su cui appoggiarsi:
// la creazione richiede quindi che l'utente sia già head_master di almeno
// una campagna della stessa organizzazione (o super-admin).
export async function isOrganizationHeadMaster(
  prisma: PrismaClient,
  userId: string,
  organizationId: number
): Promise<boolean> {
  const grant = await prisma.grant.findFirst({
    where: {
      userId,
      role: Role.head_master,
      campaign: { organizationId },
    },
  });

  return grant !== null;
}

export async function isUserCampaignHelper(
  prisma: PrismaClient,
  userId: string,
  campaignId: number
): Promise<boolean> {
  // Qualunque ruolo di campagna (anche il più basso, supporter) implica accesso.
  return checkCampaignAccess(prisma, userId, campaignId, Role.supporter);
}

// Gestione eventi (creazione/modifica/iscritti): master della campagna
// dell'evento, oppure sviluppo (accesso a qualunque campagna). Gli eventi
// senza campagna (`campaignId` nullo) sono gestibili anche dal direttivo:
// il direttivo da solo non può però gestire eventi legati a una campagna
// specifica, solo lo sviluppo web ha quel bypass.
export async function canManageEvents(
  prisma: PrismaClient,
  userId: string,
  campaignId: number | null
): Promise<boolean> {
  const flags = await getUserGroupFlags(prisma, userId);
  if (!flags) return false;
  if (campaignId === null) return flags.isDirettivo || flags.isSviluppo;
  if (flags.isSviluppo) return true;
  return isUserCampaignMaster(prisma, userId, campaignId);
}

export async function getUserCampaignRole(
  prisma: PrismaClient,
  userId: string,
  campaignId: number
): Promise<Role | null> {
  const grant = await prisma.grant.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
  });

  return grant?.role ?? null;
}

// Flag di gruppo dell'utente: `isSviluppo` è già in OR con le email cablate,
// quindi è il valore "effettivo" da usare ovunque (non leggere mai
// `user.isSviluppo` grezzo per decidere l'accesso).
export async function getUserGroupFlags(
  prisma: PrismaClient,
  userId: string
): Promise<{ isDirettivo: boolean; isSviluppo: boolean } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isDirettivo: true, isSviluppo: true, email: true },
  });

  if (!user) return null;

  return {
    isDirettivo: user.isDirettivo,
    isSviluppo: user.isSviluppo || isHardcodedSviluppo(user.email),
  };
}

// Accesso alla sezione Amministrazione (dashboard/admin + le sue API): passa
// chi fa parte del direttivo o dello sviluppo web.
export async function hasAdminSectionAccess(
  prisma: PrismaClient,
  userId: string
): Promise<boolean> {
  const flags = await getUserGroupFlags(prisma, userId);
  return flags?.isDirettivo === true || flags?.isSviluppo === true;
}

// Guardia per route handler della sezione Amministrazione: passa se l'utente
// è direttivo o sviluppo web. L'handler riceve anche `isSviluppo`, utile dove la
// risposta va differenziata (es. la gestione del gruppo "Sviluppo Web", che
// solo lo sviluppo web può modificare — vedi `/api/admin/association-roles`).
export function requireAdminSectionAccess<C>(
  handler: (
    req: Request,
    context: C,
    info: { userId: string; isSviluppo: boolean }
  ) => Promise<Response>
) {
  return async (req: Request, context: C) => {
    const session = await auth.api.getSession({ headers: req.headers });

    if (!session?.user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const { prisma } = await import("@/lib/db");
    const flags = await getUserGroupFlags(prisma, session.user.id);

    if (!flags?.isDirettivo && !flags?.isSviluppo) {
      return NextResponse.json(
        { error: "Permessi insufficienti" },
        { status: 403 }
      );
    }

    return handler(req, context, {
      userId: session.user.id,
      isSviluppo: flags.isSviluppo,
    });
  };
}

// L'anno associativo è ancorato al fuso orario dell'associazione
// (Europe/Rome), non a quello locale del server: un server in UTC calcolerebbe
// altrimenti l'anno sbagliato a cavallo di Capodanno (es. 31/12 23:30 UTC è
// già 00:30 CET del 1° gennaio).
export function getCurrentAssociationYear(
  referenceDate: Date = new Date()
): number {
  return Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Rome",
      year: "numeric",
    }).format(referenceDate)
  );
}

export async function hasValidMembershipForYear(
  prisma: PrismaClient,
  userId: string,
  year: number = getCurrentAssociationYear()
): Promise<boolean> {
  const membership = await prisma.membership.findUnique({
    where: { userId_year: { userId, year } },
  });

  return membership !== null;
}

/**
 * Guardia "quota associativa": l'accesso alle campagne passa se l'utente
 * soddisfa almeno una condizione:
 * 1. ha una `Membership` valida per l'anno corrente (quota pagata);
 * 2. fa parte del direttivo o dello sviluppo web (`isDirettivo`/`isSviluppo`
 *    effettivo) — chi ha una carica o è dello staff tecnico non deve pagare
 *    la quota.
 *
 * Non implementa alcun controllo su `UserStatus.banned` (fuori scope, T-4).
 */
export async function checkAssociationQuotaAccess(
  prisma: PrismaClient,
  userId: string
): Promise<boolean> {
  const flags = await getUserGroupFlags(prisma, userId);

  if (flags?.isDirettivo || flags?.isSviluppo) {
    return true;
  }

  return hasValidMembershipForYear(prisma, userId);
}

export type CampaignAdminAccess =
  | {
      ok: true;
      campaign: Campaign;
      userId: string;
      // Ruolo di progetto dell'utente sulla campagna. Quando l'accesso passa
      // per il bypass Sviluppo Web (`isSviluppo: true`, vedi
      // `requireCampaignAdminBySlugOrSviluppo`) l'utente potrebbe non avere
      // alcun Grant reale sulla campagna: qui viene comunque riportato
      // `head_master` perché è il livello che quel bypass concede.
      role: Role;
      isSviluppo: boolean;
    }
  | { ok: false; status: number; error: string };

// Risolve una campagna dallo slug e verifica che l'utente della sessione
// corrente soddisfi `requiredRole` su quella campagna tramite un proprio
// `Grant`. Condivisa da `requireCampaignAdminBySlug` (head_master),
// `requireCampaignMasterBySlug` (master, T-021) e
// `requireCampaignSupporterBySlug` (supporter, sola lettura): stesso identico
// flusso di risoluzione/errore, cambia solo il ruolo minimo richiesto.
//
// `allowSviluppoBypass` esiste SOLO per `requireCampaignAdminBySlugOrSviluppo`
// (gestione staff/Grant di una campagna dalla vista "god view" di
// Amministrazione > Gestione Ruoli, dove Sviluppo Web deve poter editare
// qualunque campagna anche senza un proprio Grant). Le altre route di
// campagna (impostazioni, upload, missive, downtime, xp, ecc.) NON hanno più
// alcun bypass generico — è una scelta esplicita per non reintrodurre un
// "god mode" diffuso: passa `false` (default) ovunque tranne lì.
async function requireCampaignRoleBySlug(
  prisma: PrismaClient,
  headers: Headers,
  campaignSlug: string,
  orgSlug: string,
  requiredRole: Role,
  allowSviluppoBypass = false
): Promise<CampaignAdminAccess> {
  const session = await auth.api.getSession({ headers });
  if (!session?.user) {
    return { ok: false, status: 401, error: "Non autenticato" };
  }

  const { getCampaignBySlug } =
    await import("./repositories/campaign.repository");
  const campaign = await getCampaignBySlug(prisma, campaignSlug, orgSlug);
  if (!campaign) {
    return { ok: false, status: 404, error: "Campagna non trovata" };
  }

  if (allowSviluppoBypass) {
    const flags = await getUserGroupFlags(prisma, session.user.id);
    if (flags?.isSviluppo) {
      return {
        ok: true,
        campaign,
        userId: session.user.id,
        role: Role.head_master,
        isSviluppo: true,
      };
    }
  }

  const role = await getUserCampaignRole(prisma, session.user.id, campaign.id);
  if (role === null || ROLE_RANK[role] < ROLE_RANK[requiredRole]) {
    return { ok: false, status: 403, error: "Permessi insufficienti" };
  }

  return {
    ok: true,
    campaign,
    userId: session.user.id,
    role,
    isSviluppo: false,
  };
}

// Risolve una campagna dallo slug e verifica che l'utente della sessione
// corrente possa amministrarne le assegnazioni di ruolo (head_master della
// campagna). Usata dalle route di gestione dei Grant di campagna, dove serve
// sia la campagna risolta sia l'esito dell'autorizzazione. Nessun bypass:
// vedi `requireCampaignAdminBySlugOrSviluppo` per la variante con bypass
// Sviluppo Web usata dalla vista "god view" di Amministrazione.
export async function requireCampaignAdminBySlug(
  prisma: PrismaClient,
  headers: Headers,
  campaignSlug: string,
  orgSlug: string
): Promise<CampaignAdminAccess> {
  return requireCampaignRoleBySlug(
    prisma,
    headers,
    campaignSlug,
    orgSlug,
    Role.head_master
  );
}

// Come `requireCampaignAdminBySlug`, ma con bypass per chi è effettivamente
// Sviluppo Web (`isSviluppo`): usata SOLO dalle route di gestione Grant
// (`/api/campaigns/[campaignSlug]/grants*`) invocate anche dalla vista
// "god view" di Amministrazione > Gestione Ruoli, dove Sviluppo Web deve
// poter gestire lo staff di qualunque campagna, non solo delle proprie.
export async function requireCampaignAdminBySlugOrSviluppo(
  prisma: PrismaClient,
  headers: Headers,
  campaignSlug: string,
  orgSlug: string
): Promise<CampaignAdminAccess> {
  return requireCampaignRoleBySlug(
    prisma,
    headers,
    campaignSlug,
    orgSlug,
    Role.head_master,
    true
  );
}

// Come `requireCampaignAdminBySlug`, ma con la soglia più bassa "master"
// (head_master ⊇ master): usata dalle route riservate al master di campagna
// ma non esclusive dell'head_master (gestione documenti, T-021).
export async function requireCampaignMasterBySlug(
  prisma: PrismaClient,
  headers: Headers,
  campaignSlug: string,
  orgSlug: string
): Promise<CampaignAdminAccess> {
  return requireCampaignRoleBySlug(
    prisma,
    headers,
    campaignSlug,
    orgSlug,
    Role.master
  );
}

// Come `requireCampaignAdminBySlug`, ma con la soglia più bassa "supporter"
// (head_master ⊇ master ⊇ supporter): qualunque membro dello staff della
// campagna, usata dalle route di sola lettura (es. GET dei Grant di
// campagna, dove un supporter deve poter vedere lo staff senza poterlo
// modificare).
export async function requireCampaignSupporterBySlug(
  prisma: PrismaClient,
  headers: Headers,
  campaignSlug: string,
  orgSlug: string
): Promise<CampaignAdminAccess> {
  return requireCampaignRoleBySlug(
    prisma,
    headers,
    campaignSlug,
    orgSlug,
    Role.supporter
  );
}

export const getEffectiveUserId = cache(async function getEffectiveUserId(
  headers: Headers
): Promise<string | null> {
  const { getSessionContext } = await import("@/lib/impersonation");
  const context = await getSessionContext(headers);
  return context?.activeUser.id ?? null;
});
