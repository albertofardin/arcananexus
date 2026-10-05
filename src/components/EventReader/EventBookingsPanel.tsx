"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import SectionCard from "./SectionCard";
import BadgeRole from "@/components/BadgeRole";
import AvatarUser from "@/components/AvatarUser";
import Icon from "@/components/_core/Icon";
import Divider from "@/components/_core/Divider";
import Btn from "@/components/_core/Btn";
import BtnLink from "@/components/_core/BtnLink";
import Badge from "@/components/_core/Badge";
import Text from "@/components/_core/Text";
import FieldSelect from "@/components/_core/FieldSelect";
import BtnCheckbox from "@/components/_core/BtnCheckbox";
import { useToast } from "@/components/_core/Toast";

export interface EventBookingItem {
  id: number;
  person: string;
  userImage: string | null;
  characterName: string | null;
  characterAvatar: string | null;
  addedByStaff: boolean;
}

export interface EventStaffCandidate {
  id: string;
  name: string;
  image?: string | null;
}

export interface EventPlayerCandidate {
  id: number;
  name: string;
  image?: string | null;
  player: string;
}

export interface IEventBookingsPanel {
  eventId: number;
  bookings: EventBookingItem[];
  // Membri staff della campagna non ancora iscritti; vuoto per eventi senza campagna.
  staffCandidates: EventStaffCandidate[];
  // Personaggi giocatore approvati non ancora iscritti; vuoto per eventi senza campagna.
  playerCandidates?: EventPlayerCandidate[];
}

const NOTIFY_TOOLTIP =
  "Avvisa la persona iscritta nel pannello notifiche e via email";

/** Elenco iscritti (persona + personaggio), export CSV e iscrizione gratuita dello staff. */
const EventBookingsPanel = ({
  eventId,
  bookings,
  staffCandidates,
  playerCandidates = [],
}: IEventBookingsPanel) => {
  const router = useRouter();
  const { showToast } = useToast();
  const [staffId, setStaffId] = React.useState<string>();
  const [characterId, setCharacterId] = React.useState<number>();
  const [notifyStaff, setNotifyStaff] = React.useState(true);
  const [notifyPlayer, setNotifyPlayer] = React.useState(true);
  const [adding, setAdding] = React.useState(false);

  const add = async (
    path: "staff" | "players",
    body: object,
    success: string,
    reset: () => void
  ) => {
    setAdding(true);
    try {
      const response = await fetch(`/api/events/${eventId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new Error(json?.error ?? "Errore durante l'iscrizione");
      }
      reset();
      showToast({ variant: "success", message: success });
      router.refresh();
    } catch (error) {
      showToast({
        variant: "error",
        message: error instanceof Error ? error.message : "Errore",
      });
    } finally {
      setAdding(false);
    }
  };

  const addStaff = () =>
    add(
      "staff",
      { userId: staffId, notify: notifyStaff },
      "Staff iscritto",
      () => setStaffId(undefined)
    );
  const addPlayer = () =>
    add(
      "players",
      { characterId, notify: notifyPlayer },
      "Giocatore iscritto",
      () => setCharacterId(undefined)
    );

  const players = bookings.filter(booking => !booking.addedByStaff);
  const staff = bookings.filter(booking => booking.addedByStaff);

  return (
    <SectionCard
      icon="groups"
      title={`Iscritti (totale ${bookings.length})`}
      badge={
        <>
          <BtnLink
            icon="download"
            label="Esporta CSV"
            href={`/api/events/${eventId}/bookings`}
          />
          <BadgeRole type="onlyStaff" />
        </>
      }
    >
      <Group
        icon="person"
        title="Giocatori"
        count={players.length}
        placeholder="Nessun giocatore iscritto"
      >
        {players.map(booking => (
          <Row key={booking.id} booking={booking} />
        ))}
      </Group>

      {playerCandidates.length > 0 && (
        <div className="flex flex-col gap-1">
          <FieldSelect
            className="min-w-[220px] flex-1"
            label="Iscrivi gratuitamente un personaggio giocatore"
            placeholder="Seleziona un personaggio"
            items={playerCandidates.map(character => ({
              id: character.id,
              label: `${character.name} (${character.player})`,
              avatar: character.image ?? undefined,
              avatarText: character.name,
            }))}
            value={characterId}
            onChange={value => setCharacterId(value as number)}
          />
          <div className="flex flex-row-reverse gap-3">
            <Btn
              className="min-w-[130px] text-center"
              icon="person_add"
              label="Aggiungi"
              disabled={!characterId || adding}
              onClick={addPlayer}
            />
            <BtnCheckbox
              label="Notifica"
              tooltip={NOTIFY_TOOLTIP}
              selected={notifyPlayer}
              onClick={setNotifyPlayer}
            />
          </div>
        </div>
      )}

      <Divider />

      <Group
        icon="master"
        title="Staff"
        count={staff.length}
        placeholder="Nessuno staffer iscritto"
      >
        {staff.map(booking => (
          <Row key={booking.id} booking={booking} />
        ))}
      </Group>

      {staffCandidates.length > 0 && (
        <div className="flex flex-col gap-1">
          <FieldSelect
            className="flex-1 w-full"
            label="Iscrivi gratuitamente un membro dello staff"
            placeholder="Seleziona un membro dello staff"
            items={staffCandidates.map(user => ({
              id: user.id,
              label: user.name,
              avatar: user.image ?? undefined,
              avatarText: user.name,
              avatarCircle: true,
            }))}
            value={staffId}
            onChange={value => setStaffId(value as string)}
          />
          <div className="flex flex-row-reverse gap-3">
            <Btn
              className="min-w-[130px] text-center"
              icon="person_add"
              label="Aggiungi"
              disabled={!staffId || adding}
              onClick={addStaff}
            />
            <BtnCheckbox
              label="Notifica"
              tooltip={NOTIFY_TOOLTIP}
              selected={notifyStaff}
              onClick={setNotifyStaff}
            />
          </div>
        </div>
      )}
    </SectionCard>
  );
};

const Group = ({
  icon,
  title,
  count,
  placeholder,
  children,
}: {
  icon: string;
  title: string;
  count: number;
  placeholder: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-center gap-2">
      <Badge label={String(count)} />
      <Icon className="text-primary" children={icon} />
      <Text size={2} weight="bolder" children={title} />
    </div>
    {count === 0 ? (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border p-4">
        <Icon className="text-muted-fg" children="person_off" />
        <Text className="text-muted-fg" children={placeholder} />
      </div>
    ) : (
      <div className="flex flex-col">{children}</div>
    )}
  </div>
);

// Con personaggio (eventi di campagna): avatar del personaggio, titolo il
// personaggio e sotto il giocatore. Senza (staff, eventi senza campagna):
// avatar dell'utente, titolo il nome, nessun sottotitolo.
const Row = ({ booking }: { booking: EventBookingItem }) => (
  <div className="flex items-center gap-2 -mx-1 p-1 hover:bg-accent rounded">
    <AvatarUser
      src={booking.userImage ?? undefined}
      text={booking.person}
      circle
      size={30}
    />
    <Text weight="bolder" ellipsis children={booking.person} />
    {booking.characterName && (
      <Text
        size={0}
        className="text-muted-fg"
        ellipsis
        children={" · " + booking.characterName}
      />
    )}
  </div>
);

export default EventBookingsPanel;
