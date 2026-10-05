import { z } from "zod";
import { ERROR_EMAIL } from "../utils";

// T-046: niente campo tenantId/company — l'app non ha login multi-tenant
// (campo legacy rimosso, vedi FormDemandPassword.tsx).
export const formDemandPasswordSchema = z.object({
  username: z.string().trim().min(1, "Campo obbligatorio").email(ERROR_EMAIL),
});

export type FormDemandPasswordValues = z.infer<typeof formDemandPasswordSchema>;
