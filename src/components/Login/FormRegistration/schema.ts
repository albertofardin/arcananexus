import { z } from "zod";
import { ERROR_EMAIL } from "../utils";

// Solo per la UX del client (submit disabilitato / tooltip): la validazione
// server-side resta `signupSchema` in src/lib/validations/signup.ts. Il
// campo `password` non ha un vincolo di formato qui: `FormChoosePassword`
// (non toccato da questo refactor) chiama `onValid` solo quando le due
// password coincidono e rispettano la policy, quindi qui basta richiederlo
// non vuoto.
export const formRegistrationSchema = z.object({
  email: z.string().trim().min(1, "Campo obbligatorio").email(ERROR_EMAIL),
  username: z.string().trim().min(1, "Campo obbligatorio"),
  password: z.string().min(1, "Campo obbligatorio"),
  acceptPrivacyTermsOfService: z
    .boolean()
    .refine(v => v === true, "Devi accettare la Privacy Policy"),
  acceptCurrentTermsOfService: z
    .boolean()
    .refine(v => v === true, "Devi dare il consenso al trattamento dati"),
});

export type FormRegistrationValues = z.infer<typeof formRegistrationSchema>;
