import Image from "next/image";
import InfoItem from "./InfoItem";
import SectionCard from "./SectionCard";
import BtnEventUnsubscribe from "./BtnEventUnsubscribe";
import EventBookingsPanel, {
  type EventBookingItem,
  type EventStaffCandidate,
  type EventPlayerCandidate,
} from "./EventBookingsPanel";
import Text from "@/components/_core/Text";
import Icon from "@/components/_core/Icon";
import HeroBanner from "@/components/HeroBanner";
import Divider from "@/components/_core/Divider";
import Card from "@/components/_core/Card";
import Badge from "@/components/_core/Badge";
import BtnLink from "@/components/_core/BtnLink";
import {
  getEventStatus,
  eventStatusConfig,
} from "@/components/EventList/status";
import { routes } from "@/app/routes";
import { themeColors } from "@/app/themes";
import { NO_CAMPAIGN_LABEL, type EventDetail } from "@/lib/validations/event";

const ARCANA_DOMINE_LOGO = "/mobile/icon-192.png";

export interface IEventReader {
  event: EventDetail;
  viewer: {
    isManager: boolean;
    booking: {
      characterName: string | null;
      // Quota alternativa scelta all'iscrizione (null = quota base).
      optionLabel: string | null;
      // Quota rimborsata in buoni disiscrivendosi (0 se iscritto gratis dallo staff).
      refund: number;
      // Disiscrizione possibile fino all'inizio dell'evento.
      canCancel: boolean;
    } | null;
    // Esito di un'iscrizione appena tentata (`?iscrizione=` dopo l'iscrizione).
    notice?: "ok" | "errore" | null;
  };
  // Solo per chi gestisce l'evento.
  bookings?: EventBookingItem[];
  staffCandidates?: EventStaffCandidate[];
  playerCandidates?: EventPlayerCandidate[];
}

// Le date dell'evento sono sempre mostrate nel fuso dell'associazione, non in
// quello del server.
const formatDateTime = (date: Date) =>
  new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Rome",
  }).format(date);

const formatPrice = (price: number) =>
  price > 0
    ? new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
      }).format(price)
    : "Gratuito";

/** Pagina di dettaglio di un evento: hero + informazioni + iscrizione (+ iscritti per chi lo gestisce). */
const EventReader = ({
  event,
  viewer,
  bookings = [],
  staffCandidates = [],
  playerCandidates = [],
}: IEventReader) => {
  const status = eventStatusConfig[getEventStatus(event)];
  const campaignSlug = event.campaign?.slug;
  const canRegister = getEventStatus(event) === "open" && !viewer.booking;
  // Da iscritto si vede la quota pagata, non più il listino dell'evento.
  const paidOption =
    viewer.booking &&
    (viewer.booking.optionLabel ??
      (event.paymentOptions.length > 0 && viewer.booking.refund > 0
        ? "Quota base"
        : null));

  return (
    <>
      <div className="flex items-center justify-between">
        <BtnLink
          href={
            campaignSlug ? routes.campaignEvents(campaignSlug) : routes.events()
          }
          icon="arrow_back"
          label="Torna agli eventi"
        />
        {viewer.isManager && (
          <BtnLink
            icon="edit"
            label="Modifica evento"
            href={routes.eventEdit(campaignSlug, event.id)}
          />
        )}
      </div>

      {event.visibility === "hidden" && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <Icon className="text-amber-600" children="visibility_off" />
          <Text children="Evento nascosto: lo vede solo lo staff, i giocatori non lo trovano." />
        </div>
      )}

      {viewer.notice === "ok" && (
        <div className="flex items-center gap-3 rounded-lg border border-green-500/40 bg-green-500/10 p-3">
          <Icon className="text-green-600" children="check_circle" />
          <Text weight="bolder" children="Iscrizione completata!" />
        </div>
      )}
      {viewer.notice === "errore" && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3">
          <Icon className="text-red-600" children="error" />
          <Text children="L'iscrizione non è andata a buon fine. Se hai già pagato, contatta lo staff." />
        </div>
      )}

      {/* ── hero ─────────────────────────────── */}
      <HeroBanner className="flex flex-col gap-3 p-4">
        <div className="flex-1 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div
            className="relative aspect-video w-full shrink-0 rounded-lg overflow-hidden sm:h-24 sm:w-auto"
            style={
              event.image
                ? undefined
                : {
                    backgroundColor: event.campaign?.color
                      ? `color-mix(in srgb, ${themeColors.find(t => t.id === event.campaign?.color)?.swatch} 20%, var(--muted-bg))`
                      : "var(--muted-bg)",
                  }
            }
          >
            <Image
              src={event.image || event.campaign?.logo || ARCANA_DOMINE_LOGO}
              alt={event.name}
              fill
              sizes="(min-width: 640px) 171px, 100vw"
              className={event.image ? "object-cover" : "object-contain p-2"}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap gap-2">
              <Badge label={event.campaign?.name ?? NO_CAMPAIGN_LABEL} />
              <Badge label={status.label} color={status.color} />
            </div>
            <Text
              size={7}
              weight="bolder"
              className="break-words text-3xl sm:text-4xl"
              style={{ color: "#fff" }}
              children={event.name}
            />
          </div>
        </div>
      </HeroBanner>

      {/* ── prezzo + iscrizione ──────────────── */}
      <Card className="flex-col items-stretch gap-5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 min-w-[48px] items-center justify-center rounded bg-primary/10">
              <Icon className="text-primary" children="euro" />
            </div>
            <div>
              <Text
                className="text-muted-fg"
                children={
                  viewer.booking ? "La tua quota" : "Quota di iscrizione"
                }
              />
              <Text
                size={5}
                weight="bolder"
                children={formatPrice(
                  viewer.booking ? viewer.booking.refund : event.price
                )}
              />
              {paidOption && (
                <Text
                  size={0}
                  className="text-muted-fg"
                  children={paidOption}
                />
              )}
              {!viewer.booking && event.paymentOptions.length > 0 && (
                <Text
                  size={0}
                  className="text-muted-fg"
                  children={`In alternativa: ${event.paymentOptions
                    .map(
                      option =>
                        `${option.label} (${formatPrice(option.amount)})`
                    )
                    .join(", ")}`}
                />
              )}
            </div>
          </div>

          {viewer.booking ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-green-500/40 bg-green-500/10 p-3">
              <Icon className="text-green-600" children="check_circle" />
              <Text
                className="flex-1"
                children={
                  viewer.booking.characterName
                    ? `Sei iscritto con il personaggio ${viewer.booking.characterName}`
                    : "Sei iscritto a questo evento"
                }
              />
              {viewer.booking.canCancel && (
                <BtnEventUnsubscribe
                  eventId={event.id}
                  eventName={event.name}
                  refund={viewer.booking.refund}
                />
              )}
            </div>
          ) : canRegister ? (
            <BtnLink
              variant="bold"
              icon="person_add"
              label="Iscriviti"
              href={routes.eventRegister(campaignSlug, event.id)}
            />
          ) : (
            <Text
              className="text-muted-fg"
              children={
                getEventStatus(event) === "upcoming"
                  ? `Le iscrizioni aprono il ${formatDateTime(event.datePublicationStart)}.`
                  : "Le iscrizioni non sono disponibili."
              }
            />
          )}
        </div>

        {event.place && (
          <>
            <Divider />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <InfoItem icon="location" label="Luogo" value={event.place} />
              <BtnLink
                icon="map"
                label="Apri in Google Maps"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.place)}`}
              />
            </div>
            <iframe
              title={`Mappa: ${event.place}`}
              src={`https://maps.google.com/maps?q=${encodeURIComponent(event.place)}&output=embed`}
              className="h-52 w-full max-w-lg rounded-lg border border-border"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </>
        )}
      </Card>

      {/* ── date ─────────────────────────────── */}
      <SectionCard icon="event" title="Svolgimento evento">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <InfoItem
            icon="date_start"
            label="Inizio gioco"
            value={formatDateTime(event.dateEventStart)}
          />
          <InfoItem
            icon="date_end"
            label="Fine gioco"
            value={formatDateTime(event.dateEventEnd)}
          />
        </div>
      </SectionCard>

      <SectionCard icon="lock_open" title="Iscrizioni">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <InfoItem
            icon="date_start"
            label="Apertura iscrizioni"
            value={formatDateTime(event.datePublicationStart)}
          />
          <InfoItem
            icon="date_end"
            label="Chiusura iscrizioni"
            value={formatDateTime(event.datePublicationEnd)}
          />
        </div>
      </SectionCard>

      <SectionCard icon="description" title="Descrizione">
        <Text
          className="whitespace-pre-line break-words"
          children={event.description}
        />
      </SectionCard>

      {viewer.isManager && (
        <EventBookingsPanel
          eventId={event.id}
          bookings={bookings}
          staffCandidates={staffCandidates}
          playerCandidates={playerCandidates}
        />
      )}
    </>
  );
};

export default EventReader;
