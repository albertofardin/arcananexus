import z from "zod";

// Stesso calcolo di getAge/isMinor in
// src/app/(dashboard)/dashboard/profile/page.tsx, ripetuto qui perché la
// visibilità server-side del vincolo "tutore obbligatorio" non deve dipendere
// dal frontend (vedi updateProfileSchema.superRefine).
export const isMinor = (birth: Date): boolean => {
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age < 18;
};

// Dati anagrafici (PersonalData): i primi 6 campi vanno inviati insieme
// quando si aggiorna questa sezione (colonne NOT NULL). Gli ultimi 5
// (contatti + tutore legale) sono colonne nullable indipendenti: la UI li
// invia insieme agli altri, ma restano opzionali uno dall'altro.
export const personalDataSchema = z.object({
  firstName: z.string().min(1, "Il nome è obbligatorio"),
  lastName: z.string().min(1, "Il cognome è obbligatorio"),
  ssn: z.string().min(1, "Il codice fiscale è obbligatorio"),
  address: z.string().min(1, "L'indirizzo è obbligatorio"),
  dateOfBirth: z.coerce.date(),
  placeOfBirth: z.string().min(1, "Il luogo di nascita è obbligatorio"),
  phone: z.string().nullable().optional(),
  nationality: z.string().nullable().optional(),
  guardianName: z.string().nullable().optional(),
  guardianPhone: z.string().nullable().optional(),
  guardianEmail: z.string().nullable().optional(),
});

export type PersonalDataInput = z.infer<typeof personalDataSchema>;

// GET /api/profile
export const profileUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  emailVerified: z.boolean(),
  emailNotificationsEnabled: z.boolean(),
});

export const profileResponseSchema = z.object({
  user: profileUserSchema,
  personalData: personalDataSchema.nullable(),
});

export type ProfileResponse = z.infer<typeof profileResponseSchema>;

// PUT /api/profile/update
// Tutti i campi sono opzionali: il client invia solo ciò che vuole
// aggiornare. I campi anagrafici "core", se presenti, devono esserlo tutti
// insieme (vedi personalDataSchema e PERSONAL_DATA_KEYS sotto). I contatti
// (telefono/nazionalità/tutore) sono colonne nullable indipendenti, non
// soggette a quel vincolo "tutto o niente".
const PERSONAL_DATA_KEYS = [
  "firstName",
  "lastName",
  "ssn",
  "address",
  "dateOfBirth",
  "placeOfBirth",
] as const;

// La UI esistente invia sempre l'intero form, quindi i campi anagrafici non
// ancora compilati arrivano come stringa vuota: la trattiamo come "non
// inviata" invece che come input non valido.
const emptyStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const updateProfileSchema = z
  .object({
    // Come per i campi anagrafici, la UI esistente invia sempre l'intero
    // form: un `name`/`image` non ancora valorizzato arriva come stringa
    // vuota e va trattato come "non inviato", non come richiesta di
    // azzerare il campo (vedi review T-6, MINOR "image: '' azzera
    // l'avatar"). Per rimuovere davvero l'avatar il client invia `image:
    // null` (valore esplicito e distinto da "non inviato").
    name: z.preprocess(
      emptyStringToUndefined,
      z.string().min(1, "Il nome è obbligatorio").optional()
    ),
    email: z.string().email("Email non valida").optional(),
    // Richiesta solo quando si tenta un vero cambio email (vedi il
    // confronto con l'email di sessione nel route handler): conferma che
    // chi sta operando conosce la password attuale, dato che cambiare
    // l'email equivale a cambiare le credenziali di accesso.
    currentPassword: z
      .string()
      .min(1, "La password attuale è obbligatoria")
      .optional(),
    image: z.preprocess(
      emptyStringToUndefined,
      z.string().nullable().optional()
    ),
    // Toggle "Notifiche via email" (T-0xx, pagina profilo): a differenza
    // degli altri campi non fa parte del form principale, la UI lo invia da
    // solo al click — resta comunque nello stesso schema/endpoint per non
    // duplicare l'intero flusso di autenticazione/autorizzazione di questa
    // route per un singolo booleano.
    emailNotificationsEnabled: z.boolean().optional(),
    firstName: z.preprocess(
      emptyStringToUndefined,
      z.string().min(1, "Il nome è obbligatorio").optional()
    ),
    lastName: z.preprocess(
      emptyStringToUndefined,
      z.string().min(1, "Il cognome è obbligatorio").optional()
    ),
    ssn: z.preprocess(
      emptyStringToUndefined,
      z.string().min(1, "Il codice fiscale è obbligatorio").optional()
    ),
    address: z.preprocess(
      emptyStringToUndefined,
      z.string().min(1, "L'indirizzo è obbligatorio").optional()
    ),
    dateOfBirth: z.preprocess(
      emptyStringToUndefined,
      z.coerce.date().optional()
    ),
    placeOfBirth: z.preprocess(
      emptyStringToUndefined,
      z.string().min(1, "Il luogo di nascita è obbligatorio").optional()
    ),
    // Contatti e tutore legale: colonne nullable, indipendenti dal gruppo
    // "core" sopra. guardianName/guardianPhone diventano obbligatori solo se
    // la persona risulta minorenne (vedi superRefine sotto).
    phone: z.preprocess(emptyStringToUndefined, z.string().optional()),
    nationality: z.preprocess(emptyStringToUndefined, z.string().optional()),
    guardianName: z.preprocess(emptyStringToUndefined, z.string().optional()),
    guardianPhone: z.preprocess(emptyStringToUndefined, z.string().optional()),
    guardianEmail: z.preprocess(
      emptyStringToUndefined,
      z.string().email("Email del tutore non valida").optional()
    ),
  })
  .refine(
    data => {
      const provided = PERSONAL_DATA_KEYS.filter(
        key => data[key] !== undefined
      );
      return (
        provided.length === 0 || provided.length === PERSONAL_DATA_KEYS.length
      );
    },
    {
      message:
        "Per aggiornare i dati anagrafici è necessario inviare tutti i campi",
      path: ["firstName"],
    }
  )
  .superRefine((data, ctx) => {
    // Stesso calcolo del frontend (vedi getAge/isMinor in
    // dashboard/profile/page.tsx): se la data di nascita inviata risulta
    // minorenne, i dati del tutore diventano obbligatori anche lato server.
    if (!data.dateOfBirth || !isMinor(data.dateOfBirth)) {
      return;
    }
    if (!data.guardianName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Il nome del tutore è obbligatorio per i minorenni",
        path: ["guardianName"],
      });
    }
    if (!data.guardianPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Il telefono del tutore è obbligatorio per i minorenni",
        path: ["guardianPhone"],
      });
    }
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// POST /api/profile/password
export const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, "La password attuale è obbligatoria"),
  newPassword: z
    .string()
    .min(8, "La nuova password deve avere almeno 8 caratteri"),
});

export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;

// "Anagrafica completamente compilata" (requisito d'iscrizione a un evento):
// i campi core sono NOT NULL in DB, restano da verificare stringhe vuote e,
// per i minorenni, i dati del tutore (stesso vincolo di updateProfileSchema).
export const isPersonalDataComplete = (
  data: {
    firstName: string;
    lastName: string;
    ssn: string;
    address: string;
    placeOfBirth: string;
    dateOfBirth: Date;
    guardianName?: string | null;
    guardianPhone?: string | null;
  } | null
): boolean => {
  if (!data) return false;
  const core = [
    data.firstName,
    data.lastName,
    data.ssn,
    data.address,
    data.placeOfBirth,
  ].every(value => value.trim() !== "");
  if (!core) return false;
  return (
    !isMinor(data.dateOfBirth) ||
    Boolean(data.guardianName?.trim() && data.guardianPhone?.trim())
  );
};
