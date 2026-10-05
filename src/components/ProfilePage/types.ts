export interface FormData {
  name: string;
  email: string;
  emailVerified: boolean;
  emailNotificationsEnabled: boolean;
  image: string | null;
  firstName: string;
  lastName: string;
  ssn: string;
  address: string;
  dateOfBirth: string;
  placeOfBirth: string;
  phone: string;
  nationality: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
}

// Stesso vincolo "tutto o niente" di PERSONAL_DATA_KEYS in
// src/lib/validations/profile.ts: i campi anagrafici "core" vanno inviati
// insieme, quindi vanno anche validati/segnalati insieme lato client.
export const CORE_FIELDS = [
  "firstName",
  "lastName",
  "ssn",
  "address",
  "dateOfBirth",
  "placeOfBirth",
] as const satisfies readonly (keyof FormData)[];

export type RequiredFieldKey =
  (typeof CORE_FIELDS)[number] | "guardianName" | "guardianPhone";
