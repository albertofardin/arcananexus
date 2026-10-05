import z from "zod";

// Dati anagrafici così come esposti dall'API admin/users: stessa forma di
// `personalDataSchema` in `profile.ts`, ripetuta qui perché il consumer è
// diverso (elenco admin vs form profilo) e non vogliamo un accoppiamento
// implicito tra i due.
export const adminUserPersonalDataSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  ssn: z.string(),
  address: z.string(),
  dateOfBirth: z.coerce.date(),
  placeOfBirth: z.string(),
});

export const adminUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  image: z.string().nullable(),
  createdAt: z.coerce.date(),
  // null finché l'utente non ha compilato i dati anagrafici (PersonalData è
  // opzionale 1:1 su User).
  personalData: adminUserPersonalDataSchema.nullable(),
  // Anni in cui l'utente ha una Membership; vuoto se mai tesserato.
  membershipYears: z.array(z.number()),
});

// GET /api/admin/users
export const adminUsersResponseSchema = z.object({
  users: z.array(adminUserSchema),
  // Tutti gli anni di tesseramento esistenti (non filtrati), per il filtro
  // anno lato UI.
  availableYears: z.array(z.number()),
  pagination: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

export type AdminUser = z.infer<typeof adminUserSchema>;
export type AdminUsersResponse = z.infer<typeof adminUsersResponseSchema>;

// Query params di GET /api/admin/users: validati al bordo così un `page`/
// `pageSize`/`year` malformato torna 400 invece di propagarsi a Prisma (es.
// `skip: NaN`) o di produrre una risposta incoerente (`pageSize=0` →
// `totalPages: Infinity`). `pageSize` è limitata a 100 per evitare query
// unbounded.
export const adminUsersQuerySchema = z.object({
  search: z.string().optional(),
  year: z.coerce.number().int().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
