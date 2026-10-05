import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { cache } from "react";
import EventRegisterForm from "./EventRegisterForm";
import EventReader from "@/components/EventReader";
import EventWriter, { type EventFormValues } from "@/components/EventWriter";
import HeroPage from "@/components/HeroPage";
import Card from "@/components/_core/Card";
import Text from "@/components/_core/Text";
import Icon from "@/components/_core/Icon";
import BtnLink from "@/components/_core/BtnLink";
import { prisma } from "@/lib/db";
import { listCampaignCharacters } from "@/lib/repositories/character.repository";
import { getCharacterStatus } from "@/components/BadgeCharacterStatus/status";
import { auth } from "@/lib/auth";
import {
  canManageEvents,
  getCurrentAssociationYear,
  getUserGroupFlags,
} from "@/lib/authorization";
import {
  bookingRefund,
  getVoucherBalance,
} from "@/lib/repositories/voucher.repository";
import {
  getEventByIdScoped,
  getEventMetadataByIdScoped,
  countPaidBookings,
} from "@/lib/repositories/event.repository";
import {
  getBookingForUser,
  listEventBookings,
} from "@/lib/repositories/booking.repository";
import {
  listGrantsForCampaign,
  listMasterCampaigns,
} from "@/lib/repositories/grant.repository";
import {
  getCampaignBySlug,
  listCampaignsByOrgSlug,
} from "@/lib/repositories/campaign.repository";
import { getRegistrationState } from "@/lib/eventRegistration";
import { personName } from "@/lib/eventBookingsCsv";
import type { EventDetail } from "@/lib/validations/event";
import truncateText from "@/lib/utils/truncateText";
import { routes } from "@/app/routes";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

const fetchEvent = cache(getEventByIdScoped);

async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) notFound();
  return session.user;
}

// Un evento vive a un solo URL: sotto la sua campagna, oppure sotto
// `/dashboard/events` se non ne ha. Ogni altro abbinamento è 404.
async function loadEvent(eventId: string, campaignSlug?: string) {
  const id = Number(eventId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const event = await fetchEvent(prisma, id, ARCANA_DOMINE_SLUG);
  if (!event || (event.campaign?.slug ?? null) !== (campaignSlug ?? null)) {
    notFound();
  }
  return event;
}

export async function generateEventMetadata(
  eventId: string
): Promise<Metadata> {
  const event = await getEventMetadataByIdScoped(
    prisma,
    Number(eventId),
    ARCANA_DOMINE_SLUG
  );
  if (!event) return { title: "Evento Non Trovato" };

  return {
    title: `${event.name} | Arcana Domine`,
    description: truncateText(event.description) || undefined,
    openGraph: {
      title: event.name,
      description: truncateText(event.description) || undefined,
      images: event.image ? [{ url: event.image }] : undefined,
    },
  };
}

// Campagne selezionabili nel form: lo sviluppo web sceglie fra tutte (+
// "nessuna campagna"); il direttivo solo "nessuna campagna" (nessun accesso
// alle campagne altrui); chiunque altro solo le campagne di cui è master.
async function getCampaignOptions(userId: string) {
  const flags = await getUserGroupFlags(prisma, userId);

  if (flags?.isSviluppo) {
    const campaigns = await listCampaignsByOrgSlug(prisma, ARCANA_DOMINE_SLUG, {
      includeHidden: true,
    });
    return {
      canChooseNoCampaign: true,
      campaigns: campaigns.map(({ slug, name }) => ({ slug, name })),
    };
  }
  if (flags?.isDirettivo) {
    return { canChooseNoCampaign: true, campaigns: [] };
  }
  return {
    canChooseNoCampaign: false,
    campaigns: await listMasterCampaigns(prisma, userId, ARCANA_DOMINE_SLUG),
  };
}

export async function EventDetailPage({
  eventId,
  campaignSlug,
  notice,
}: {
  eventId: string;
  campaignSlug?: string;
  notice?: string;
}) {
  const user = await requireSession();
  const event = await loadEvent(eventId, campaignSlug);

  const detail: EventDetail = {
    id: event.id,
    name: event.name,
    place: event.place,
    image: event.image,
    description: event.description,
    dateEventStart: event.dateEventStart,
    dateEventEnd: event.dateEventEnd,
    datePublicationStart: event.datePublicationStart,
    datePublicationEnd: event.datePublicationEnd,
    price: Number(event.price),
    visibility: event.visibility,
    campaign: event.campaign,
    bookingCount: event._count.bookings,
    socials: event.socials.map(({ link, icon }) => ({ link, icon })),
    paymentOptions: event.paymentOptions.map(option => ({
      id: option.id,
      label: option.label,
      amount: Number(option.amount),
    })),
  };

  const isManager = await canManageEvents(prisma, user.id, event.campaignId);
  // Eventi nascosti: solo per chi gestisce l'evento. Le date di apertura/chiusura
  // iscrizioni non influenzano la visibilità della pagina, solo la possibilità di iscriversi.
  if (!isManager && event.visibility === "hidden") {
    notFound();
  }

  const [booking, bookingRows, grants, campaignCharacters] = await Promise.all([
    getBookingForUser(prisma, event.id, user.id),
    isManager ? listEventBookings(prisma, event.id) : [],
    isManager && event.campaignId !== null
      ? listGrantsForCampaign(prisma, event.campaignId)
      : [],
    isManager && event.campaignId !== null
      ? listCampaignCharacters(prisma, event.campaignId)
      : [],
  ]);

  const bookedUserIds = new Set(bookingRows.map(row => row.user.id));

  return (
    <EventReader
      event={detail}
      viewer={{
        isManager,
        booking: booking
          ? {
              characterName: booking.character?.name ?? null,
              optionLabel: booking.paymentOptionLabel,
              refund: bookingRefund(booking),
              canCancel: new Date() < event.dateEventStart,
            }
          : null,
        notice: notice === "ok" || notice === "errore" ? notice : null,
      }}
      bookings={bookingRows.map(row => ({
        id: row.id,
        person: personName(row),
        userImage: row.user.image,
        characterName: row.character?.name ?? null,
        characterAvatar: row.character?.avatar ?? null,
        addedByStaff: row.addedByStaff,
      }))}
      staffCandidates={grants
        .filter(grant => !bookedUserIds.has(grant.userId))
        .map(grant => ({
          id: grant.userId,
          name: grant.user.name,
          image: grant.user.image,
        }))}
      playerCandidates={campaignCharacters
        .filter(
          character =>
            character.type === "pg" &&
            getCharacterStatus(character) === "approved" &&
            !bookedUserIds.has(character.userId)
        )
        .map(character => ({
          id: character.id,
          name: character.name,
          image: character.avatar,
          player: character.user.name,
        }))}
    />
  );
}

export async function EventNewPage({
  campaignSlug,
}: {
  campaignSlug?: string;
}) {
  const user = await requireSession();
  const campaign = campaignSlug
    ? await getCampaignBySlug(prisma, campaignSlug, ARCANA_DOMINE_SLUG)
    : null;
  if (campaignSlug && !campaign) notFound();
  if (!(await canManageEvents(prisma, user.id, campaign?.id ?? null))) {
    notFound();
  }

  const { canChooseNoCampaign, campaigns } = await getCampaignOptions(user.id);

  return (
    <>
      <BtnLink
        href={
          campaignSlug ? routes.campaignEvents(campaignSlug) : routes.events()
        }
        icon="arrow_back"
        label="Torna agli eventi"
      />
      <HeroPage title="Nuovo evento" />
      <EventWriter
        campaigns={campaigns}
        canChooseNoCampaign={canChooseNoCampaign}
        defaultCampaignSlug={campaignSlug}
      />
    </>
  );
}

export async function EventEditPage({
  eventId,
  campaignSlug,
}: {
  eventId: string;
  campaignSlug?: string;
}) {
  const user = await requireSession();
  const event = await loadEvent(eventId, campaignSlug);
  if (!(await canManageEvents(prisma, user.id, event.campaignId))) notFound();

  const { canChooseNoCampaign, campaigns } = await getCampaignOptions(user.id);
  const values: EventFormValues = {
    id: event.id,
    name: event.name,
    image: event.image,
    description: event.description,
    place: event.place,
    dateEventStart: event.dateEventStart.toISOString(),
    dateEventEnd: event.dateEventEnd.toISOString(),
    datePublicationStart: event.datePublicationStart.toISOString(),
    datePublicationEnd: event.datePublicationEnd.toISOString(),
    price: Number(event.price),
    visibility: event.visibility,
    campaignSlug: event.campaign?.slug ?? null,
    bookingCount: event._count.bookings,
    paidBookingCount: await countPaidBookings(prisma, event.id),
    paymentOptions: event.paymentOptions.map(option => ({
      label: option.label,
      amount: Number(option.amount),
    })),
  };

  return (
    <>
      <BtnLink
        href={routes.event(campaignSlug, event.id)}
        icon="arrow_back"
        label="Torna all'evento"
      />
      <HeroPage title="Modifica evento" subtitle={event.name} />
      <EventWriter
        event={values}
        campaigns={campaigns}
        canChooseNoCampaign={canChooseNoCampaign}
      />
    </>
  );
}

interface Requirement {
  ok: boolean;
  title: string;
  message: string;
  href?: string;
  cta?: string;
}

// Landing d'iscrizione: elenca i requisiti (soddisfatti o no, con il link per
// risolvere quelli mancanti) e, quando tutti sono ok, mostra il form.
export async function EventRegisterPage({
  eventId,
  campaignSlug,
  payment,
}: {
  eventId: string;
  campaignSlug?: string;
  payment?: string;
}) {
  const user = await requireSession();
  const event = await loadEvent(eventId, campaignSlug);
  if (event.visibility === "hidden") notFound();

  const [state, voucherBalance] = await Promise.all([
    getRegistrationState(prisma, event, user.id),
    getVoucherBalance(prisma, user.id, getCurrentAssociationYear()),
  ]);
  const price = Number(event.price);

  const requirements: Requirement[] = [
    {
      ok: state.window === "open",
      title: "Iscrizioni aperte",
      message:
        state.window === "open"
          ? "Le iscrizioni sono aperte."
          : state.window === "upcoming"
            ? "Le iscrizioni non sono ancora aperte."
            : "Le iscrizioni a questo evento sono chiuse.",
    },
    {
      ok: state.hasMembership,
      title: "Iscrizione all'associazione",
      message: state.hasMembership
        ? "La tua quota associativa è in regola."
        : "Per partecipare devi essere iscritto all'associazione per l'anno in corso.",
      href: routes.profileMembership(),
      cta: "Vai alla tessera",
    },
    {
      ok: state.hasCompletePersonalData,
      title: "Anagrafica completa",
      message: state.hasCompletePersonalData
        ? "La tua anagrafica è completa."
        : "Completa tutti i campi della tua anagrafica (per i minorenni anche i dati del tutore).",
      href: routes.profile(),
      cta: "Completa l'anagrafica",
    },
    ...(state.needsCharacter
      ? [
          {
            ok: state.characters.length > 0,
            title: "Personaggio attivo",
            message:
              state.characters.length > 0
                ? "Hai almeno un personaggio attivo in questa campagna."
                : "Serve un personaggio attivo (approvato) in questa campagna. Se ne hai creato uno, attendi l'approvazione dello staff.",
            href: event.campaign
              ? routes.campaignCharacterNew(event.campaign.slug)
              : undefined,
            cta: "Crea un personaggio",
          },
        ]
      : []),
  ];

  return (
    <>
      <BtnLink
        href={routes.event(campaignSlug, event.id)}
        icon="arrow_back"
        label="Torna all'evento"
      />
      <HeroPage title="Iscrizione" subtitle={event.name} />

      {payment === "annullato" && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <Icon className="text-amber-600" children="info" />
          <Text children="Pagamento annullato: non ti è stato addebitato nulla. Puoi riprovare quando vuoi." />
        </div>
      )}

      {state.existingBooking ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <Icon className="text-amber-600" children="info" />
          <div>
            <Text weight="bolder" children="Sei già iscritto a questo evento" />
            <Text
              children={
                state.existingBooking.characterName
                  ? `Hai iscritto il personaggio ${state.existingBooking.characterName}.`
                  : "Non serve iscriversi di nuovo."
              }
            />
          </div>
        </div>
      ) : (
        <>
          {!state.canRegister && (
            <Card className="flex-col items-stretch gap-3 p-4">
              <Text size={3} weight="bolder" children="Prima di iscriverti" />
              {requirements.map(requirement => (
                <div
                  key={requirement.title}
                  className="flex flex-wrap items-center gap-3"
                >
                  <Icon
                    className={
                      requirement.ok ? "text-green-600" : "text-red-600"
                    }
                    children={requirement.ok ? "check_circle" : "cancel"}
                  />
                  <div className="min-w-0 flex-1">
                    <Text weight="bolder" children={requirement.title} />
                    <Text
                      className="text-muted-fg"
                      children={requirement.message}
                    />
                  </div>
                  {!requirement.ok && requirement.href && (
                    <BtnLink
                      selected
                      color="var(--warn)"
                      icon="warning"
                      label={requirement.cta ?? "Vai"}
                      href={requirement.href}
                    />
                  )}
                </div>
              ))}
            </Card>
          )}

          {state.canRegister && (
            <EventRegisterForm
              eventId={event.id}
              campaignSlug={campaignSlug}
              characters={state.characters}
              price={price}
              voucherBalance={voucherBalance}
              paymentOptions={event.paymentOptions.map(option => ({
                id: option.id,
                label: option.label,
                amount: Number(option.amount),
              }))}
            />
          )}
        </>
      )}
    </>
  );
}
