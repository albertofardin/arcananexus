import type { PrismaClient } from "@prisma/client";
import { hasValidMembershipForYear } from "@/lib/authorization";
import { getBookingForUser } from "@/lib/repositories/booking.repository";
import { getPersonalDataByUserId } from "@/lib/repositories/personalData.repository";
import { listUserCharacters } from "@/lib/repositories/character.repository";
import { getCharacterStatus } from "@/components/BadgeCharacterStatus/status";
import { isPersonalDataComplete } from "@/lib/validations/profile";

export type RegistrationWindow = "upcoming" | "open" | "closed";

export interface RegistrationState {
  existingBooking: { characterName: string | null } | null;
  window: RegistrationWindow;
  hasMembership: boolean;
  hasCompletePersonalData: boolean;
  // Solo eventi di campagna: personaggi attivi (approvati) del giocatore.
  characters: { id: number; name: string; avatar: string | null }[];
  needsCharacter: boolean;
  canRegister: boolean;
}

interface EventForRegistration {
  id: number;
  campaignId: number | null;
  datePublicationStart: Date;
  datePublicationEnd: Date;
}

const ALL_USER_CHARACTERS = 1000;

// Unica fonte di verità dei requisiti d'iscrizione, usata sia dalla pagina di
// iscrizione (landing dei requisiti mancanti) sia dalle API (enforcement
// server-side): la UI non decide mai da sola chi può iscriversi.
export async function getRegistrationState(
  prisma: PrismaClient,
  event: EventForRegistration,
  userId: string,
  now: Date = new Date()
): Promise<RegistrationState> {
  const [booking, hasMembership, personalData, ownCharacters] =
    await Promise.all([
      getBookingForUser(prisma, event.id, userId),
      // Tessera vera, senza l'esenzione direttivo/sviluppo di
      // `checkAssociationQuotaAccess`: a un evento partecipa solo chi è tesserato.
      hasValidMembershipForYear(prisma, userId),
      getPersonalDataByUserId(prisma, userId),
      event.campaignId === null
        ? Promise.resolve([])
        : listUserCharacters(prisma, {
            userId,
            take: ALL_USER_CHARACTERS,
          }),
    ]);

  const characters = ownCharacters
    .filter(
      character =>
        character.campaignId === event.campaignId &&
        getCharacterStatus(character) === "approved"
    )
    .map(({ id, name, avatar }) => ({ id, name, avatar }));

  const window: RegistrationWindow =
    now < event.datePublicationStart
      ? "upcoming"
      : now > event.datePublicationEnd
        ? "closed"
        : "open";
  const hasCompletePersonalData = isPersonalDataComplete(personalData);
  const needsCharacter = event.campaignId !== null;

  return {
    existingBooking: booking
      ? { characterName: booking.character?.name ?? null }
      : null,
    window,
    hasMembership,
    hasCompletePersonalData,
    characters,
    needsCharacter,
    canRegister:
      !booking &&
      window === "open" &&
      hasMembership &&
      hasCompletePersonalData &&
      (!needsCharacter || characters.length > 0),
  };
}
