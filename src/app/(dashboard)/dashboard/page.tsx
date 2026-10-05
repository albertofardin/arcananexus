"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import Card from "@/components/_core/Card";
import Text from "@/components/_core/Text";
import Icon from "@/components/_core/Icon";
import AvatarUser from "@/components/AvatarUser";
import HeroBanner from "@/components/HeroBanner";
import { EventListRow, EventListRowSkeleton } from "@/components/EventList";
import { EmptyCard } from "@/components/Feedback";
import BtnLink from "@/components/_core/BtnLink";
import { Event, eventSchema } from "@/lib/validations/event";
import type { Campaign } from "@/lib/validations/campaign";
import { useSession } from "@/lib/auth-client";
import { useQueryCampaigns } from "@/lib/queries/campaigns";
import { useCanCreateEvent } from "@/lib/queries/capabilities";
import { routes } from "@/app/routes";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";
import BtnCampaign from "@/components/BtnCampaign";
import HeroSection from "@/components/HeroSection/HeroSection";
import { cn } from "@/lib/utils";

const MAX_UPCOMING_EVENTS = 100;
const EVENTS_LIST_MIN_HEIGHT = 320;
const CLASSNAME_BUTTON_HOVER = "hover:-translate-y-0.5 hover:shadow-xl";

const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return "Buongiorno";
  if (hour < 18) return "Buon pomeriggio";
  return "Buonasera";
};

// dateEventStart è una data pura (mezzanotte UTC): confrontiamo contro l'inizio
// di oggi in UTC così un evento "di oggi" resta visibile tutto il giorno,
// invece di sparire non appena l'ora corrente supera la mezzanotte.
const getStartOfToday = (): Date => {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  return startOfToday;
};

// Filtro/ordinamento difensivo lato client: il server (`sort=asc` +
// `startDate`, vedi il fetch sotto) restituisce già solo eventi futuri in
// ordine cronologico, ma questo mantiene la vista corretta anche se la
// query string cambiasse in futuro senza aggiornare l'endpoint.
const getUpcomingEvents = (events: Event[]): Event[] => {
  const startOfToday = getStartOfToday();
  return events
    .filter(event => event.dateEventStart.getTime() >= startOfToday.getTime())
    .sort((a, b) => a.dateEventStart.getTime() - b.dateEventStart.getTime());
};

function CardCampaign({ campaign }: { campaign: Campaign }) {
  const router = useRouter();
  return (
    <BtnCampaign
      camps={[campaign]}
      slcCamp={campaign}
      size={[0, 100]}
      onClick={() => router.push(routes.campaign(campaign.slug))}
      style={{
        width: "100%",
        minWidth: "100%",
        maxWidth: "100%",
        padding: "60px 20px",
      }}
    />
  );
}

export default function Page() {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user;

  const { data: campaigns, isPending: campaignsPending } = useQueryCampaigns();
  const canCreateEvent = useCanCreateEvent();

  const { data: events, isPending: eventsPending } = useQuery<Event[]>({
    queryKey: ["events", ARCANA_DOMINE_SLUG],
    queryFn: async () => {
      // `startDate`/`sort=asc`/`pageSize` espliciti: senza, l'endpoint
      // applica il suo default (`desc`, nessun filtro data, 12 righe) —
      // con più di 12 eventi futuri pubblicati sull'intera piattaforma, il
      // `take` in ordine decrescente avrebbe selezionato i 12 eventi più
      // *lontani* nel tempo invece dei più imminenti (il widget avrebbe
      // potuto mostrare "Nessun evento in programma" pur avendone).
      const params = new URLSearchParams({
        orgSlug: ARCANA_DOMINE_SLUG,
        startDate: getStartOfToday().toISOString(),
        sort: "asc",
        pageSize: String(MAX_UPCOMING_EVENTS),
      });
      const response = await fetch(`/api/events?${params.toString()}`);
      const json = await response.json();
      return z.array(eventSchema).parse(json.events);
    },
  });

  const upcomingEvents = React.useMemo(
    () => getUpcomingEvents(events ?? []),
    [events]
  );
  const visibleEvents = upcomingEvents.slice(0, MAX_UPCOMING_EVENTS);
  const hiddenEventsCount = upcomingEvents.length - visibleEvents.length;

  return (
    <>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-stretch">
        {/* ── banner di benvenuto ──────────────── */}
        <HeroBanner
          className={cn(CLASSNAME_BUTTON_HOVER, "flex-1")}
          onClick={() => router.push(routes.profile())}
        >
          <div className="flex gap-3 flex-col items-center text-center sm:text-left sm:flex-row">
            <div className="rounded-full p-1 border-2 border-primary">
              <AvatarUser
                size={72}
                src={user?.image}
                text={user?.name}
                className="text-2xl font-bold"
                circle
              />
            </div>
            <div className="w-full">
              <Text
                size={4}
                weight="bolder"
                ellipsis
                className="leading-tight"
                style={{ color: "#fff" }}
                children={
                  user?.name ? `${getGreeting()}, ${user.name}` : "Bentornato"
                }
              />
              <Text
                ellipsis
                style={{ color: "rgba(255,255,255,0.7)" }}
                children="Ecco i prossimi eventi e le campagne disponibili"
              />
            </div>
          </div>
        </HeroBanner>

        {/* ── invito community WhatsApp ────────── */}
        <a
          href="https://chat.whatsapp.com/E4IBZFxv76sDZDgtONt8bK"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "group relative flex min-w-0 items-center gap-4 overflow-hidden rounded-xl",
            "px-5 py-4 transition-all duration-300 sm:px-8 sm:py-5 xl:flex-1 xl:py-6",
            CLASSNAME_BUTTON_HOVER
          )}
          style={{
            background: "linear-gradient(135deg, #128C7E 0%, #25D366 100%)",
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-15"
            style={{
              backgroundImage: "url(/textures/whatsapp.webp)",
              backgroundSize: "450px auto",
              backgroundRepeat: "repeat",
              mixBlendMode: "multiply",
            }}
          />
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20">
            <span className="absolute inset-0 hidden rounded-full bg-white/60 opacity-0" />
            <svg
              viewBox="0 0 24 24"
              fill="#fff"
              className="relative h-7 w-7"
              aria-hidden="true"
            >
              <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.515 5.26l-.999 3.648 3.973-1.607zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z" />
            </svg>
          </div>

          <div className="relative min-w-0 flex-1">
            <Text
              size={4}
              weight="bolder"
              className="line-clamp-2 leading-tight"
              style={{ color: "#fff" }}
              children="Community WhatsApp"
            />
            <Text
              className="line-clamp-2"
              style={{ color: "rgba(255,255,255,0.85)" }}
              children="Unisciti per restare aggiornato su eventi e novità"
            />
          </div>
          <div className="relative hidden shrink-0 items-center gap-1.5 rounded-full bg-[#075E54] px-4 py-2 sm:flex">
            <Text weight="bolder" style={{ color: "#fff" }} children="Entra" />
            <Icon style={{ color: "#fff" }} children="arrow_forward" />
          </div>
        </a>
      </div>

      {/* ── campagne ─────────────────────────── */}
      <Card className="flex-col items-stretch p-2 flex-1 gap-3 justify-start">
        <HeroSection
          icon="tower"
          title="Campagne"
          subtitle="Seleziona l'ambientazione che fa per te"
        />
        {campaignsPending ? (
          <div className="gap-3 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-[150px] animate-pulse rounded-xl bg-muted-bg sm:h-[160px]"
              />
            ))}
          </div>
        ) : campaigns && campaigns.length > 0 ? (
          <div className="gap-3 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {campaigns.map(campaign => (
              <CardCampaign key={campaign.id} campaign={campaign} />
            ))}
          </div>
        ) : (
          <EmptyCard
            icon="tower"
            title="Non sei coinvolto in nessuna campagna"
            className="border-0 p-0"
          />
        )}
      </Card>

      {/* ── prossimi eventi ──────────────────── */}
      <Card className="flex-col items-stretch p-2 flex-1 gap-3 justify-start">
        <HeroSection
          icon="event"
          title="Prossimi eventi"
          subtitle="Le date in programma di tutte le campagne"
          action={
            canCreateEvent && (
              <BtnLink
                variant="bold"
                icon="add"
                label="Nuovo evento"
                href={routes.eventNew()}
              />
            )
          }
        />
        <div
          className="flex flex-col rounded-lg"
          style={{ minHeight: EVENTS_LIST_MIN_HEIGHT }}
        >
          {eventsPending ? (
            Array.from({ length: 4 }).map((_, i) => (
              <EventListRowSkeleton key={i} />
            ))
          ) : visibleEvents.length > 0 ? (
            <>
              {visibleEvents.map(event => (
                <EventListRow key={event.id} event={event} />
              ))}
              {hiddenEventsCount > 0 && (
                <Text
                  className="text-muted-fg pt-3 text-center"
                  children={`+ altri ${hiddenEventsCount} eventi in programma`}
                />
              )}
            </>
          ) : (
            <EmptyCard
              icon="event_busy"
              title="Nessun evento in programma"
              className="border-0 p-0"
            />
          )}
        </div>
      </Card>
    </>
  );
}
