"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import EventListRow, { EventListRowSkeleton } from "./EventListRow";
import EventsFilterBar, { type IEventFilters } from "./EventsFilterBar";
import Btn from "@/components/_core/Btn";
import BtnLink from "@/components/_core/BtnLink";
import Card from "@/components/_core/Card";
import Divider from "@/components/_core/Divider";
import HeroPage from "@/components/HeroPage";
import { ErrorCard, EmptyCard } from "@/components/Feedback";
import {
  eventListResponseSchema,
  NO_CAMPAIGN_LABEL,
  type EventListResponse,
  type EventStatusFilter,
} from "@/lib/validations/event";
import { useCanCreateEvent } from "@/lib/queries/capabilities";
import { useQueryCampaigns } from "@/lib/queries/campaigns";
import { routes } from "@/app/routes";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

// nessuna paginazione: la vista mostra sempre tutti gli eventi (di una
// campagna, o di tutta l'associazione quando campaignSlug è assente).
const ALL_EVENTS_PAGE_SIZE = 500;

// Valore sentinella per il filtro campagna: seleziona gli eventi
// dell'associazione senza campagna (es. piscinate, ritrovi). Non collide
// con uno slug reale, che ammette solo lettere minuscole, numeri e trattini.
const NO_CAMPAIGN_FILTER_VALUE = "_none";

const isEventStatusFilter = (value: string): value is EventStatusFilter =>
  value === "open" ||
  value === "closed" ||
  value === "past" ||
  value === "upcoming";

export interface IEventList {
  /** Se assente, mostra gli eventi di tutte le campagne dell'associazione. */
  campaignSlug?: string;
}

const EventList = ({ campaignSlug }: IEventList) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const orgSlug = ARCANA_DOMINE_SLUG;
  const canCreate = useCanCreateEvent(campaignSlug);
  const { data: campaigns } = useQueryCampaigns(!campaignSlug);

  const [filters, setFilters] = React.useState<IEventFilters>(() => {
    const statusParam = searchParams.get("status") ?? "";
    return {
      startDate: searchParams.get("startDate") || "",
      endDate: searchParams.get("endDate") || "",
      status: isEventStatusFilter(statusParam) ? statusParam : "all",
      myBookings: searchParams.get("myBookings") === "true",
      campaignSlug: searchParams.get("campaignSlug") || "",
    };
  });

  const effectiveCampaignSlug = campaignSlug || filters.campaignSlug;

  const buildQueryString = () => {
    const queryParams = new URLSearchParams({
      orgSlug,
      pageSize: ALL_EVENTS_PAGE_SIZE.toString(),
    });

    if (effectiveCampaignSlug === NO_CAMPAIGN_FILTER_VALUE)
      queryParams.set("noCampaign", "true");
    else if (effectiveCampaignSlug)
      queryParams.set("campaignSlug", effectiveCampaignSlug);
    if (filters.startDate) queryParams.set("startDate", filters.startDate);
    if (filters.endDate) queryParams.set("endDate", filters.endDate);
    if (filters.status !== "all") queryParams.set("status", filters.status);
    if (filters.myBookings) queryParams.set("myBookings", "true");

    return queryParams.toString();
  };

  const { data, isLoading, error, refetch } = useQuery<EventListResponse>({
    queryKey: ["events", orgSlug, effectiveCampaignSlug, filters],
    queryFn: async () => {
      const response = await fetch(`/api/events?${buildQueryString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch events");
      }
      const json = await response.json();
      return eventListResponseSchema.parse(json);
    },
  });

  const updateFilters = (newFilters: Partial<IEventFilters>) => {
    const updated = { ...filters, ...newFilters };
    setFilters(updated);

    const urlParams = new URLSearchParams();
    if (updated.startDate) urlParams.set("startDate", updated.startDate);
    if (updated.endDate) urlParams.set("endDate", updated.endDate);
    if (updated.status !== "all") urlParams.set("status", updated.status);
    if (updated.myBookings) urlParams.set("myBookings", "true");
    if (!campaignSlug && updated.campaignSlug)
      urlParams.set("campaignSlug", updated.campaignSlug);

    const newUrl = urlParams.toString()
      ? `${pathname}?${urlParams.toString()}`
      : pathname;
    router.push(newUrl as never, { scroll: false });
  };

  const handleResetFilters = () => {
    updateFilters({
      startDate: "",
      endDate: "",
      status: "all",
      myBookings: false,
      campaignSlug: "",
    });
  };

  const hasActiveFilters = Boolean(
    filters.startDate ||
    filters.endDate ||
    filters.status !== "all" ||
    filters.myBookings ||
    filters.campaignSlug
  );

  return (
    <>
      <HeroPage
        title="Eventi"
        subtitle={
          campaignSlug
            ? "Eventi della campagna"
            : "Eventi di tutta l'associazione"
        }
        action={
          canCreate && (
            <BtnLink
              variant="bold"
              icon="add"
              label="Nuovo evento"
              href={routes.eventNew(campaignSlug)}
            />
          )
        }
      />
      <Card className="min-h-fit flex flex-col items-stretch justify-start p-0">
        <EventsFilterBar
          filters={filters}
          onFilterChange={updateFilters}
          campaignItems={
            campaignSlug
              ? undefined
              : [
                  {
                    id: NO_CAMPAIGN_FILTER_VALUE,
                    label: NO_CAMPAIGN_LABEL,
                  },
                  ...(campaigns?.map(c => ({ id: c.slug, label: c.name })) ??
                    []),
                ]
          }
        />
        <Divider />
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {error && <ErrorCard onRetry={() => refetch()} />}
          {!error &&
            (isLoading || (data && data.events.length > 0)) &&
            (isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <EventListRowSkeleton key={i} />
                ))
              : data?.events.map(event => (
                  <EventListRow
                    key={event.id}
                    event={event}
                    campaignName={!effectiveCampaignSlug}
                  />
                )))}
          {!error && data && data.events.length === 0 && (
            <EmptyCard
              icon="event_busy"
              title="Nessun evento trovato"
              message={
                hasActiveFilters
                  ? "Prova a modificare i filtri di ricerca"
                  : "Non ci sono eventi disponibili al momento"
              }
              action={
                hasActiveFilters ? (
                  <Btn
                    label="Rimuovi filtri"
                    icon="close"
                    onClick={handleResetFilters}
                  />
                ) : undefined
              }
            />
          )}
        </div>
      </Card>
    </>
  );
};

export default EventList;
