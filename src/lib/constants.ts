import { CharacterType, Role } from "@prisma/client";
import type { CharacterStatus } from "@/components/BadgeCharacterStatus/status";

export const ARCANA_DOMINE_SLUG = "arcana-domine";
// Quota associativa annuale (Tesseramento e pagamenti, T-051): importo fisso,
// nessuna opzione di pagamento come per gli eventi.
export const MEMBERSHIP_FEE = 10;
export const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST;
export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

// Email cablate del gruppo "Sviluppo Web": sono sempre `isSviluppo`, a
// prescindere dal valore a DB, e non possono essere rimosse dal gruppo
// né dall'interfaccia (RoleManager) né dall'API (vedi
// `src/lib/authorization.ts` e `/api/admin/association-roles`). Vive qui
// (non in `authorization.ts`, server-only) perché serve anche lato client
// per disabilitare la rimozione nell'interfaccia.
export const HARDCODED_SVILUPPO_EMAILS = [
  "mattia@arcana.it",
  "prevalentementealberto@gmail.com",
  // "dev@arcanadomine.it",
  // "fattomatto92@hotmail.it",
  // "nico.moro.dev@gmail.com",
] as const;

export function isHardcodedSviluppo(email: string): boolean {
  return (HARDCODED_SVILUPPO_EMAILS as readonly string[]).includes(email);
}

export const ROLE_COLORS: Record<Role, string> = {
  [Role.head_master]: "#de792b",
  [Role.master]: "#7c3aed",
  [Role.supporter]: "#0d9488",
};

export const CHARACTER_STATUS: Record<
  CharacterStatus,
  { label: string; icon: string; color: string }
> = {
  dead: { label: "Deceduto", icon: "skull", color: "#DC2626" },
  parked: { label: "In Pausa", icon: "hourglass", color: "#939393" },
  approved: { label: "Attivo", icon: "emoji_emotions", color: "#16A34A" },
  review: { label: "In Revisione", icon: "chat_feedback", color: "#D97706" },
};

export const CHARACTER_TYPE: Record<
  CharacterType,
  { label: string; icon: string; color: string }
> = {
  [CharacterType.pg]: { label: "PG", icon: "person", color: "#15803D" },
  [CharacterType.png]: { label: "PNG", icon: "master", color: "#B45309" },
};
