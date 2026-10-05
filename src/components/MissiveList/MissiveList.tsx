"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Role } from "@prisma/client";
import Card from "../_core/Card";
import Btn from "../_core/Btn";
import FieldSelect from "../_core/FieldSelect";
import FieldText from "../_core/FieldText";
import FieldDate from "../_core/FieldDate";
import Pagination from "../_core/Pagination";
import { ErrorCard, EmptyCard } from "../Feedback";
import Accordion from "../_core/Accordion";
import BadgeRole from "../BadgeRole";
import MissiveRow from "./MissiveRow";
import MissiveRowSkeleton from "./MissiveRowSkeleton";
import {
  parseSenderParam,
  parseReceiverParam,
  parsePageParam,
  parseBoxParam,
  getFieldItems,
  getEventFieldItems,
  toDateInputValue,
} from "./helpers";
import {
  missiveListResponseSchema,
  type MissiveBox,
  type MissiveListResponse,
  type MissiveReceiverOption,
  type MissiveSenderFilter,
  type MissiveSenderOption,
} from "@/lib/validations/missive";
import {
  eventListResponseSchema,
  type EventListResponse,
} from "@/lib/validations/event";
import { ARCANA_DOMINE_SLUG, ROLE_COLORS } from "@/lib/constants";

// Sentinelle "nessun filtro" per i quattro `FieldSelect`: a differenza di
// `senderCharacterId`/`receiverCharacterId`/`dateFrom`/`dateTo` (assenti =
// nessun filtro), il `FieldSelect` ha sempre bisogno di un `value`
// selezionato.
const ALL_SENDERS = "__all_senders__";
const ALL_RECEIVERS = "__all_receivers__";
const ALL_EVENTS_FROM = "__all_events_from__";
const ALL_EVENTS_TO = "__all_events_to__";

// Nessuna paginazione: la campagna ha sempre pochi eventi, servono tutti
// per popolare i due select "Da evento"/"A evento" (stesso valore già
// usato dalla pagina Eventi, `dashboard/[campaignSlug]/events/page.tsx`).
const ALL_EVENTS_PAGE_SIZE = 500;

interface MissiveFilters {
  senderCharacterId?: MissiveSenderFilter;
  receiverCharacterId?: number;
  search: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  box: MissiveBox;
}

export interface MissiveListProps {
  campaignSlug: string;
}

const MissiveList = ({ campaignSlug }: MissiveListProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [filters, setFilters] = React.useState<MissiveFilters>(() => ({
    senderCharacterId: parseSenderParam(searchParams.get("senderCharacterId")),
    receiverCharacterId: parseReceiverParam(
      searchParams.get("receiverCharacterId")
    ),
    search: searchParams.get("search") ?? "",
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? "",
    page: parsePageParam(searchParams.get("page")),
    box: parseBoxParam(searchParams.get("box")),
  }));

  const buildQueryString = (f: MissiveFilters) => {
    const queryParams = new URLSearchParams();
    if (f.senderCharacterId !== undefined) {
      queryParams.set("senderCharacterId", String(f.senderCharacterId));
    }
    if (f.receiverCharacterId !== undefined) {
      queryParams.set("receiverCharacterId", String(f.receiverCharacterId));
    }
    if (f.search) queryParams.set("search", f.search);
    if (f.dateFrom) queryParams.set("dateFrom", f.dateFrom);
    if (f.dateTo) queryParams.set("dateTo", f.dateTo);
    if (f.page > 1) queryParams.set("page", String(f.page));
    // Default "Posta in arrivo" omesso dall'URL, stesso principio degli
    // altri filtri opzionali.
    if (f.box !== "inbox") queryParams.set("box", f.box);
    return queryParams.toString();
  };

  const { data, isLoading, error, refetch } = useQuery<MissiveListResponse>({
    queryKey: ["missive", campaignSlug, filters],
    queryFn: async () => {
      const query = buildQueryString(filters);
      const response = await fetch(
        `/api/campaigns/${campaignSlug}/missive${query ? `?${query}` : ""}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch missive");
      }
      const json = await response.json();
      return missiveListResponseSchema.parse(json);
    },
  });

  // Qualunque filtro cambia il set di risultati, quindi riporta sempre a
  // pagina 1 — a meno che sia proprio la paginazione a chiamare
  // `updateFilters` (i controlli Prev/Next passano `page` esplicitamente,
  // che allora vince sull'azzeramento).
  const updateFilters = (newFilters: Partial<MissiveFilters>) => {
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
      senderCharacterId: undefined,
      receiverCharacterId: undefined,
      search: "",
      dateFrom: "",
      dateTo: "",
    });
  };

  const hasActiveFilters = Boolean(
    filters.senderCharacterId !== undefined ||
    filters.receiverCharacterId !== undefined ||
    filters.search ||
    filters.dateFrom ||
    filters.dateTo
  );

  const senderOptions: MissiveSenderOption[] =
    data?.filterOptions.senders ?? [];
  const receiverOptions: MissiveReceiverOption[] =
    data?.filterOptions.receivers ?? [];

  // "Da evento"/"A evento" sono solo un modo comodo per compilare le
  // STESSE `dateFrom`/`dateTo` di "Da data"/"A data" (nessun parametro
  // aggiuntivo lato backend): selezionare un evento imposta la data, e
  // viceversa il select mostra selezionato l'evento la cui `dateEventStart`
  // combacia con la data attualmente impostata (anche se digitata a mano).
  const { data: eventsData } = useQuery<EventListResponse>({
    queryKey: ["events-for-missive-filter", campaignSlug],
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
  // Ordine/numerazione per la tendina sono affari di `getEventFieldItems`
  // (più recente in cima, numero cronologico): qui serve solo l'elenco
  // grezzo per i due `.find()` sotto, che non dipendono dall'ordine.
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
          <div className="flex flex-wrap gap-2">
            <Btn
              variant="light"
              label="Posta in arrivo"
              icon="inbox"
              selected={filters.box === "inbox"}
              onClick={() => updateFilters({ box: "inbox" })}
            />
            <Btn
              variant="light"
              label="Inviate"
              icon="send"
              selected={filters.box === "sent"}
              onClick={() => updateFilters({ box: "sent" })}
            />
            {/* Terza tab master-only (calcolato server-side, mai dedotto
                lato client): assente al primissimo render, prima che la
                fetch risolva `viewerIsMaster` — accettabile. */}
            {data?.viewerIsMaster === true && (
              <Btn
                color={ROLE_COLORS[Role.master]}
                variant="light"
                label="Tutte le missive"
                icon="mailbox"
                selected={filters.box === "all"}
                onClick={() => updateFilters({ box: "all" })}
                children={<BadgeRole type="onlyMaster" />}
              />
            )}
          </div>
          <FieldText
            placeholder="Ricerca per titolo, personaggio o giocatore..."
            value={filters.search}
            onChange={v => updateFilters({ search: v })}
          />
          <Accordion title="Filtri avanzati" titleIcon="filter_list">
            <div className="flex flex-col gap-3 lg:flex-row">
              <FieldSelect
                className="flex-1"
                label="Mittente"
                placeholder="Tutti i mittenti"
                value={filters.senderCharacterId ?? ALL_SENDERS}
                items={getFieldItems(ALL_SENDERS, senderOptions)}
                onChange={value =>
                  updateFilters({
                    senderCharacterId:
                      value === ALL_SENDERS
                        ? undefined
                        : (value as MissiveSenderFilter),
                  })
                }
              />
              <FieldSelect
                className="flex-1"
                label="Destinatario"
                placeholder="Tutti i destinatari"
                value={filters.receiverCharacterId ?? ALL_RECEIVERS}
                items={getFieldItems(ALL_RECEIVERS, receiverOptions)}
                onChange={value =>
                  updateFilters({
                    receiverCharacterId:
                      value === ALL_RECEIVERS ? undefined : Number(value),
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
            (isLoading || (data && data.missives.length > 0)) &&
            (isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <MissiveRowSkeleton key={i} />
                ))
              : data?.missives.map(missive => (
                  <MissiveRow
                    key={missive.id}
                    campaignSlug={campaignSlug}
                    missive={missive}
                    box={filters.box}
                  />
                )))}
          {!error && data && data.missives.length === 0 && (
            <EmptyCard
              icon="mail"
              title={
                hasActiveFilters
                  ? "Nessuna missiva trovata"
                  : filters.box === "all"
                    ? "Nessuna missiva trovata"
                    : filters.box === "inbox"
                      ? "Nessuna missiva ricevuta"
                      : "Nessuna missiva inviata"
              }
              message={
                hasActiveFilters
                  ? "Prova a modificare i filtri di ricerca"
                  : filters.box === "all"
                    ? "Non ci sono ancora missive in questa campagna"
                    : filters.box === "inbox"
                      ? "Non hai ancora ricevuto missive in questa campagna"
                      : "Non hai ancora inviato missive in questa campagna"
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
          itemLabel="missive"
          onPageChange={page => updateFilters({ page })}
        />
      )}
    </>
  );
};

export default MissiveList;
