"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Card from "../_core/Card";
import Btn from "../_core/Btn";
import FieldSelect from "../_core/FieldSelect";
import FieldText from "../_core/FieldText";
import FieldDate from "../_core/FieldDate";
import Pagination from "../_core/Pagination";
import { ErrorCard, EmptyCard } from "../Feedback";
import Accordion from "../_core/Accordion";
import DowntimeRow from "./DowntimeRow";
import DowntimeRowSkeleton from "./DowntimeRowSkeleton";
import {
  parseAuthorParam,
  parseCategoryParam,
  parseStatusParam,
  parsePageParam,
  getAuthorFieldItems,
  getCategoryFieldItems,
  getStatusFieldItems,
  getEventFieldItems,
  toDateInputValue,
} from "./helpers";
import {
  downtimeListResponseSchema,
  type DowntimeListResponse,
  type DowntimeAuthorOption,
} from "@/lib/validations/downtime";
import {
  DOWNTIME_STATUS_CONFIG,
  type DowntimeStatus,
} from "@/lib/downtime/status";
import {
  eventListResponseSchema,
  type EventListResponse,
} from "@/lib/validations/event";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

// Sentinelle "nessun filtro" per i quattro `FieldSelect`: a differenza di
// `authorCharacterId`/`categoryFunctionName`/`dateFrom`/`dateTo` (assenti =
// nessun filtro), il `FieldSelect` ha sempre bisogno di un `value`
// selezionato.
const ALL_AUTHORS = "__all_authors__";
const ALL_CATEGORIES = "__all_categories__";
const ALL_STATUSES = "__all_statuses__";
const ALL_EVENTS_FROM = "__all_events_from__";
const ALL_EVENTS_TO = "__all_events_to__";

// Nessuna paginazione: la campagna ha sempre pochi eventi, servono tutti
// per popolare i due select "Da evento"/"A evento" (stesso valore già
// usato dalla pagina Eventi, `dashboard/[campaignSlug]/events/page.tsx`).
const ALL_EVENTS_PAGE_SIZE = 500;

interface DowntimeFilters {
  authorCharacterId?: number;
  category?: string;
  status?: DowntimeStatus;
  search: string;
  dateFrom: string;
  dateTo: string;
  page: number;
}

export interface DowntimeListProps {
  campaignSlug: string;
}

const DowntimeList = ({ campaignSlug }: DowntimeListProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [filters, setFilters] = React.useState<DowntimeFilters>(() => ({
    authorCharacterId: parseAuthorParam(searchParams.get("authorCharacterId")),
    category: parseCategoryParam(searchParams.get("category")),
    status: parseStatusParam(searchParams.get("status")),
    search: searchParams.get("search") ?? "",
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? "",
    page: parsePageParam(searchParams.get("page")),
  }));

  const buildQueryString = (f: DowntimeFilters) => {
    const queryParams = new URLSearchParams();
    if (f.authorCharacterId !== undefined) {
      queryParams.set("authorCharacterId", String(f.authorCharacterId));
    }
    if (f.category !== undefined) {
      queryParams.set("category", f.category);
    }
    if (f.status !== undefined) queryParams.set("status", f.status);
    if (f.search) queryParams.set("search", f.search);
    if (f.dateFrom) queryParams.set("dateFrom", f.dateFrom);
    if (f.dateTo) queryParams.set("dateTo", f.dateTo);
    if (f.page > 1) queryParams.set("page", String(f.page));
    return queryParams.toString();
  };

  const { data, isLoading, error, refetch } = useQuery<DowntimeListResponse>({
    queryKey: ["downtime", campaignSlug, filters],
    queryFn: async () => {
      const query = buildQueryString(filters);
      const response = await fetch(
        `/api/campaigns/${campaignSlug}/downtime${query ? `?${query}` : ""}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch downtime");
      }
      const json = await response.json();
      return downtimeListResponseSchema.parse(json);
    },
  });

  // Qualunque filtro cambia il set di risultati, quindi riporta sempre a
  // pagina 1 — a meno che sia proprio la paginazione a chiamare
  // `updateFilters` (i controlli Prev/Next passano `page` esplicitamente,
  // che allora vince sull'azzeramento).
  const updateFilters = (newFilters: Partial<DowntimeFilters>) => {
    const updated = { ...filters, page: 1, ...newFilters };
    setFilters(updated);

    const urlParams = new URLSearchParams(buildQueryString(updated));
    const newUrl = urlParams.toString()
      ? `${pathname}?${urlParams.toString()}`
      : pathname;
    router.push(newUrl as never, { scroll: false });
  };

  const handleResetFilters = () => {
    updateFilters({
      authorCharacterId: undefined,
      category: undefined,
      status: undefined,
      search: "",
      dateFrom: "",
      dateTo: "",
    });
  };

  const hasActiveFilters = Boolean(
    filters.authorCharacterId !== undefined ||
    filters.category !== undefined ||
    filters.status !== undefined ||
    filters.search ||
    filters.dateFrom ||
    filters.dateTo
  );

  const authorOptions: DowntimeAuthorOption[] =
    data?.filterOptions.authors ?? [];
  const categoryOptions: string[] = data?.filterOptions.categories ?? [];

  // "Da evento"/"A evento" sono solo un modo comodo per compilare le
  // STESSE `dateFrom`/`dateTo` di "Da data"/"A data" (nessun parametro
  // aggiuntivo lato backend): stesso identico meccanismo di
  // `MissiveList`.
  const { data: eventsData } = useQuery<EventListResponse>({
    queryKey: ["events-for-downtime-filter", campaignSlug],
    queryFn: async () => {
      const query = new URLSearchParams({
        orgSlug: ARCANA_DOMINE_SLUG,
        campaignSlug,
        pageSize: String(ALL_EVENTS_PAGE_SIZE),
      });
      const response = await fetch(`/api/events?${query.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch events");
      }
      const json = await response.json();
      return eventListResponseSchema.parse(json);
    },
  });
  const events = eventsData?.events ?? [];
  const fromEvent = events.find(
    event => toDateInputValue(event.dateEventStart) === filters.dateFrom
  );
  const toEvent = events.find(
    event => toDateInputValue(event.dateEventStart) === filters.dateTo
  );

  return (
    <>
      <Card className="flex flex-col items-stretch p-2">
        <div className="flex flex-col gap-2">
          <FieldText
            placeholder="Ricerca per oggetto, categoria, personaggio o giocatore..."
            value={filters.search}
            onChange={v => updateFilters({ search: v })}
          />
          <Accordion title="Filtri avanzati" titleIcon="filter_list">
            <div className="flex flex-col gap-3 lg:flex-row">
              <FieldSelect
                className="flex-1"
                label="Autore"
                placeholder="Tutti i personaggi"
                value={filters.authorCharacterId ?? ALL_AUTHORS}
                items={getAuthorFieldItems(ALL_AUTHORS, authorOptions)}
                onChange={value =>
                  updateFilters({
                    authorCharacterId:
                      value === ALL_AUTHORS ? undefined : Number(value),
                  })
                }
              />
              <FieldSelect
                className="flex-1"
                label="Categoria"
                placeholder="Tutte le categorie"
                value={filters.category ?? ALL_CATEGORIES}
                items={getCategoryFieldItems(ALL_CATEGORIES, categoryOptions)}
                onChange={value =>
                  updateFilters({
                    category:
                      value === ALL_CATEGORIES ? undefined : String(value),
                  })
                }
              />
              <FieldSelect
                className="flex-1"
                label="Stato"
                placeholder="Tutti gli stati"
                value={filters.status ?? ALL_STATUSES}
                items={getStatusFieldItems(ALL_STATUSES)}
                icon={
                  filters.status
                    ? DOWNTIME_STATUS_CONFIG[filters.status].icon
                    : undefined
                }
                iconStyle={
                  filters.status
                    ? {
                        color: DOWNTIME_STATUS_CONFIG[filters.status].color,
                      }
                    : undefined
                }
                onChange={value =>
                  updateFilters({
                    status:
                      value === ALL_STATUSES
                        ? undefined
                        : (String(value) as DowntimeStatus),
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-3 pt-2 lg:flex-row">
              <div className="flex flex-1">
                <FieldSelect
                  className="flex-1 rounded-br-none rounded-tr-none border-r-0"
                  label="Da evento"
                  placeholder="Nessuno"
                  value={fromEvent?.id ?? ALL_EVENTS_FROM}
                  items={getEventFieldItems(ALL_EVENTS_FROM, events)}
                  onChange={value => {
                    const event =
                      value === ALL_EVENTS_FROM
                        ? undefined
                        : events.find(e => e.id === value);
                    updateFilters({
                      dateFrom: event
                        ? toDateInputValue(event.dateEventStart)
                        : "",
                    });
                  }}
                />
                <FieldDate
                  className="flex-1 rounded-bl-none rounded-tl-none border-l-0"
                  label="Da data specifica"
                  value={filters.dateFrom}
                  onChange={v => updateFilters({ dateFrom: v })}
                />
              </div>
              <div className="flex flex-1">
                <FieldSelect
                  className="flex-1 rounded-br-none rounded-tr-none border-r-0"
                  label="A evento"
                  placeholder="Nessuno"
                  value={toEvent?.id ?? ALL_EVENTS_TO}
                  items={getEventFieldItems(ALL_EVENTS_TO, events)}
                  onChange={value => {
                    const event =
                      value === ALL_EVENTS_TO
                        ? undefined
                        : events.find(e => e.id === value);
                    updateFilters({
                      dateTo: event
                        ? toDateInputValue(event.dateEventStart)
                        : "",
                    });
                  }}
                />
                <FieldDate
                  className="flex-1 rounded-bl-none rounded-tl-none border-l-0"
                  label="o a data specifica"
                  value={filters.dateTo}
                  onChange={v => updateFilters({ dateTo: v })}
                />
              </div>
            </div>
          </Accordion>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pt-2">
          {error && <ErrorCard onRetry={() => refetch()} />}
          {!error &&
            (isLoading || (data && data.downtimes.length > 0)) &&
            (isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <DowntimeRowSkeleton key={i} />
                ))
              : data?.downtimes.map(downtime => (
                  <DowntimeRow
                    key={downtime.id}
                    campaignSlug={campaignSlug}
                    downtime={downtime}
                  />
                )))}
          {!error && data && data.downtimes.length === 0 && (
            <EmptyCard
              icon="downtime"
              title="Nessuna downtime trovata"
              message={
                hasActiveFilters
                  ? "Prova a modificare i filtri di ricerca"
                  : "Non ci sono ancora downtime in questa campagna"
              }
              action={
                hasActiveFilters ? (
                  <Btn
                    variant="bold"
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
      {!error && data && (
        <Pagination
          page={data.pagination.page}
          pageSize={data.pagination.pageSize}
          totalCount={data.pagination.totalCount}
          totalPages={data.pagination.totalPages}
          itemLabel="downtime"
          onPageChange={page => updateFilters({ page })}
        />
      )}
    </>
  );
};

export default DowntimeList;
