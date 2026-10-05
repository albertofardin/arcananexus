// Fonte di verità per gli status derivati: riusato dallo zod enum in
// `src/lib/validations/notification.ts` (stesso pattern di
// `DOWNTIME_STATUSES` in `src/lib/downtime/status.ts`).
export const CHARACTER_STATUSES = [
  "dead",
  "parked",
  "approved",
  "review",
] as const;

export type CharacterStatus = (typeof CHARACTER_STATUSES)[number];

export interface ICharacterDates {
  deathDate?: Date | null;
  parkDate?: Date | null;
  approvalDate?: Date | null;
}

export function getCharacterStatus(
  character: ICharacterDates
): CharacterStatus {
  if (character.deathDate) return "dead";
  if (character.parkDate) return "parked";
  if (character.approvalDate) return "approved";
  return "review";
}
