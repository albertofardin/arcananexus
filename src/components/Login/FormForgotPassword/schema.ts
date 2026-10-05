import { z } from "zod";

// Solo per la UX del client: `FormChoosePassword` (non toccato da questo
// refactor) chiama `onValid` solo quando le due password coincidono e
// rispettano la policy, quindi qui basta richiederla non vuota.
export const formForgotPasswordSchema = z.object({
  password: z.string().min(1, "Campo obbligatorio"),
});

export type FormForgotPasswordValues = z.infer<typeof formForgotPasswordSchema>;
