import type { Prisma, PrismaClient, User } from "@prisma/client";

const basicUserSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
} as const;

/**
 * Risolve un nome utente (colonna `name`, resa univoca da
 * `@@unique([name])`) nell'email dell'account corrispondente, per il login
 * via username in `POST /api/login`. Uso esclusivamente server-side: non va
 * mai esposta al client, altrimenti chiunque potrebbe risalire dall'username
 * all'email di un utente senza conoscerne la password.
 */
export async function findEmailByUsername(
  prisma: PrismaClient,
  name: string
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { name },
    select: { email: true },
  });
  return user?.email ?? null;
}

/**
 * Risolve l'email di un utente a partire dal suo id. Usata da
 * `DELETE /api/admin/association-roles/[userId]` per verificare se l'utente
 * target ha un'email cablata di Sviluppo Web (`HARDCODED_SVILUPPO_EMAILS`)
 * prima di rimuoverlo dal gruppo.
 */
export async function getUserEmailById(
  prisma: PrismaClient,
  userId: string
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  return user?.email ?? null;
}

export async function listAllUsersBasic(prisma: PrismaClient) {
  return prisma.user.findMany({
    select: basicUserSelect,
    orderBy: { name: "asc" },
  });
}

export async function listDirettivoMembers(prisma: PrismaClient) {
  return prisma.user.findMany({
    where: { isDirettivo: true },
    select: { ...basicUserSelect, isDirettivo: true },
    orderBy: { name: "asc" },
  });
}

export async function setUserDirettivo(
  prisma: PrismaClient,
  userId: string,
  isDirettivo: boolean
): Promise<User> {
  return prisma.user.update({
    where: { id: userId },
    data: { isDirettivo },
  });
}

// Elenca i membri del gruppo "Sviluppo Web" in base al solo flag DB: le email
// cablate (`HARDCODED_SVILUPPO_EMAILS`) vanno unite lato `authorization.ts`/route,
// non qui, perché quelle non hanno necessariamente `isSviluppo=true` a DB.
export async function listSviluppoMembers(prisma: PrismaClient) {
  return prisma.user.findMany({
    where: { isSviluppo: true },
    select: { ...basicUserSelect, isSviluppo: true },
    orderBy: { name: "asc" },
  });
}

export async function setUserSviluppo(
  prisma: PrismaClient,
  userId: string,
  isSviluppo: boolean
): Promise<User> {
  return prisma.user.update({
    where: { id: userId },
    data: { isSviluppo },
  });
}

/**
 * Preferenza "Notifiche via email" (T-0xx, pagina profilo): letta da
 * `GET /api/profile` per popolare il toggle, scritta da
 * `setEmailNotificationsEnabled` sotto. `notifyEmail` in
 * `notification.repository.ts` legge questa stessa colonna direttamente
 * (query interna al fan-out, non passa da qui) per decidere se inviare.
 */
export async function getEmailNotificationsEnabled(
  prisma: PrismaClient,
  userId: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailNotificationsEnabled: true },
  });
  return user?.emailNotificationsEnabled ?? true;
}

export async function setEmailNotificationsEnabled(
  prisma: PrismaClient,
  userId: string,
  enabled: boolean
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { emailNotificationsEnabled: enabled },
  });
}

export interface ListUsersForAdminOptions {
  /** Ricerca su nome/email, case-insensitive. */
  search?: string;
  /** Filtra agli utenti tesserati per un anno specifico. */
  year?: number;
  page?: number;
  pageSize?: number;
}

const adminUserSelect = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  image: true,
  createdAt: true,
  PersonalData: {
    select: {
      firstName: true,
      lastName: true,
      ssn: true,
      address: true,
      dateOfBirth: true,
      placeOfBirth: true,
    },
  },
  Membership: {
    select: { year: true },
    orderBy: { year: "desc" as const },
  },
} satisfies Prisma.UserSelect;

/**
 * Elenco utenti per la schermata di Amministrazione (direttivo/sviluppo web):
 * dati anagrafici (`PersonalData`, se presenti) e anni di tesseramento
 * (`Membership`) insieme ai campi base. `availableYears` riflette tutti gli
 * anni di tesseramento esistenti (non filtrati da `search`/`year`), per
 * popolare il filtro anno lato UI.
 */
export async function listUsersForAdmin(
  prisma: PrismaClient,
  options: ListUsersForAdminOptions = {}
) {
  const { search, year, page = 1, pageSize = 50 } = options;

  const where: Prisma.UserWhereInput = {
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(year ? { Membership: { some: { year } } } : {}),
  };

  const [users, total, years] = await Promise.all([
    prisma.user.findMany({
      where,
      select: adminUserSelect,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
    prisma.membership.findMany({
      distinct: ["year"],
      select: { year: true },
      orderBy: { year: "desc" },
    }),
  ]);

  return {
    users: users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: u.emailVerified,
      image: u.image,
      createdAt: u.createdAt,
      personalData: u.PersonalData,
      membershipYears: u.Membership.map(m => m.year),
    })),
    total,
    availableYears: years.map(y => y.year),
  };
}
