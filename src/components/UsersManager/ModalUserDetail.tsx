"use client";

import { MembershipBadge, EmailVerifiedIcon } from "./UsersManager";
import Modal from "@/components/_core/Modal";
import Text from "@/components/_core/Text";
import Divider from "@/components/_core/Divider";
import FieldText from "@/components/_core/FieldText";
import AvatarUser from "@/components/AvatarUser";
import type { AdminUser } from "@/lib/validations/user";

export interface IModalUserDetail {
  user: AdminUser | null;
  onClose: () => void;
  currentYear: number;
}

const getAge = (date: Date): number | null => {
  if (isNaN(date.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const m = today.getMonth() - date.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < date.getDate())) age--;
  return age;
};

/** Elenca gli anni di tesseramento in ordine cronologico, es. "2023, 2025, 2026". */
const formatYears = (years: number[]): string =>
  [...years].sort((a, b) => a - b).join(", ");

const formatDate = (date: Date): string => {
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

/** Dettaglio anagrafico e di tesseramento di un utente, per lo staff. */
const ModalUserDetail = ({ user, onClose, currentYear }: IModalUserDetail) => {
  const renewed = user ? user.membershipYears.includes(currentYear) : false;
  const age = user?.personalData ? getAge(user.personalData.dateOfBirth) : null;

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title="Dettaglio utente"
      contentClassName="gap-4"
      content={
        user && (
          <div className="flex w-[480px] max-w-full flex-col gap-5">
            {/* intestazione */}
            <div className="flex items-center gap-4">
              <AvatarUser
                size={64}
                src={user.image ?? undefined}
                text={user.name}
                className="text-xl"
                circle
              />
              <div className="min-w-0 flex-1">
                <Text size={4} weight="bolder" ellipsis children={user.name} />
                <div className="flex items-center gap-1">
                  <EmailVerifiedIcon verified={user.emailVerified} />
                  <Text
                    className="text-muted-fg"
                    ellipsis
                    children={user.email}
                  />
                </div>
              </div>
              <MembershipBadge renewed={renewed} year={currentYear} />
            </div>

            <Divider />

            {/* dati completi: solo se l'utente ha compilato il profilo */}
            {user.personalData ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FieldText
                  disabled
                  icon="badge"
                  label="Nome"
                  value={user.personalData.firstName || "—"}
                />
                <FieldText
                  disabled
                  icon="badge"
                  label="Cognome"
                  value={user.personalData.lastName || "—"}
                />
                <FieldText
                  disabled
                  icon="event"
                  label="Data di nascita"
                  value={
                    age !== null
                      ? `${formatDate(user.personalData.dateOfBirth)} (${age} anni)`
                      : formatDate(user.personalData.dateOfBirth)
                  }
                />
                <FieldText
                  disabled
                  icon="location"
                  label="Luogo di nascita"
                  value={user.personalData.placeOfBirth || "—"}
                />
                <FieldText
                  disabled
                  icon="receipt_long"
                  label="Codice Fiscale"
                  value={user.personalData.ssn || "—"}
                />
                <div className="sm:col-span-2">
                  <FieldText
                    disabled
                    icon="home"
                    label="Indirizzo"
                    value={user.personalData.address || "—"}
                  />
                </div>
              </div>
            ) : (
              <Text
                className="text-muted-fg"
                children="Questo utente non ha ancora compilato i dati anagrafici."
              />
            )}

            <FieldText
              disabled
              icon="card_membership"
              label={
                user.membershipYears.length > 0
                  ? `Anni di tesseramento (${user.membershipYears.length})`
                  : "Tesseramento"
              }
              value={
                user.membershipYears.length > 0
                  ? formatYears(user.membershipYears)
                  : "Mai tesserato"
              }
            />
          </div>
        )
      }
    />
  );
};

export default ModalUserDetail;
