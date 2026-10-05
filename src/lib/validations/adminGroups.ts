import z from "zod";
import { userBasicSchema, grantAssignmentSchema } from "./grant";

// I due gruppi flat della sezione Amministrazione: "direttivo" (accesso ad
// Amministrazione) e "sviluppo" (accesso ad Amministrazione + impersonation).
// Non ci sono più ruoli distinti al loro interno (vedi `User.isDirettivo`/
// `User.isSviluppo`).
export const adminGroupEnum = z.enum(["direttivo", "sviluppo"]);

export const assignGroupSchema = z.object({
  userId: z.string().min(1, "Utente obbligatorio"),
  group: adminGroupEnum,
});

export const rolesOverviewCampaignSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  assignments: z.array(grantAssignmentSchema),
});

// Risposta di GET /api/admin/association-roles: tutte le campagne con le loro
// assegnazioni di ruolo (visibili a chiunque abbia accesso ad Amministrazione,
// editabili solo da Sviluppo Web — vedi `requireCampaignAdminBySlugOrSviluppo`
// e `ManagerRolesAdmin`), l'elenco utenti e i membri attuali dei due gruppi
// flat.
export const rolesOverviewResponseSchema = z.object({
  campaigns: z.array(rolesOverviewCampaignSchema),
  users: z.array(userBasicSchema),
  direttivoMemberIds: z.array(z.string()),
  sviluppoMemberIds: z.array(z.string()),
});

export type AdminGroup = z.infer<typeof adminGroupEnum>;
export type AssignGroupInput = z.infer<typeof assignGroupSchema>;
export type RolesOverviewCampaign = z.infer<typeof rolesOverviewCampaignSchema>;
export type RolesOverviewResponse = z.infer<typeof rolesOverviewResponseSchema>;
