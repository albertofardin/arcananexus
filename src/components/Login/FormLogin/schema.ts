import { z } from "zod";

// Solo per la UX del client (submit disabilitato / tooltip): la validazione
// server-side resta `loginSchema` in src/lib/validations/login.ts. Nessun
// vincolo di formato qui, allineato al comportamento preesistente del
// reducer (`allfilled`): basta che i campi non siano vuoti.
export const buildFormLoginSchema = (hiddenTenant: boolean) =>
  z.object({
    tenantId: hiddenTenant
      ? z.string()
      : z.string().trim().min(1, "Campo obbligatorio"),
    username: z.string().trim().min(1, "Campo obbligatorio"),
    password: z.string().min(1, "Campo obbligatorio"),
    rememberMe: z.boolean(),
  });

export type FormLoginValues = z.infer<ReturnType<typeof buildFormLoginSchema>>;
