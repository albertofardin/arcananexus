import z from "zod";

// Ruoli di campagna (staff), gerarchia a 3 livelli definita in T-1.
export const roleEnum = z.enum(["head_master", "master", "supporter"]);

export const createGrantSchema = z.object({
  userId: z.string().min(1, "Utente obbligatorio"),
  role: roleEnum,
});

export const updateGrantRoleSchema = z.object({
  role: roleEnum,
});

export const userBasicSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
});

export const grantAssignmentSchema = z.object({
  userId: z.string(),
  role: roleEnum,
});

// Risposta di GET /api/campaigns/[campaignSlug]/grants: le assegnazioni della
// campagna più l'elenco degli utenti registrati (per la ricerca "aggiungi staff").
export const campaignGrantsResponseSchema = z.object({
  campaign: z.object({
    id: z.number(),
    name: z.string(),
    slug: z.string(),
  }),
  assignments: z.array(grantAssignmentSchema),
  users: z.array(userBasicSchema),
});

export type CreateGrantInput = z.infer<typeof createGrantSchema>;
export type UpdateGrantRoleInput = z.infer<typeof updateGrantRoleSchema>;
export type UserBasic = z.infer<typeof userBasicSchema>;
export type GrantAssignment = z.infer<typeof grantAssignmentSchema>;
export type CampaignGrantsResponse = z.infer<
  typeof campaignGrantsResponseSchema
>;
