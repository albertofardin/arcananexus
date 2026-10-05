"use client";

import Text from "../_core/Text";
import FieldDate from "../_core/FieldDate";
import FieldSelect from "../_core/FieldSelect";
import Checkbox, { SelectType } from "../_core/Checkbox";
import { eventStatusConfig } from "./status";
import type { EventStatusFilter } from "@/lib/validations/event";

const ALL_STATUS = "all";

// Ordine dei filtri; icone e label vengono da eventStatusConfig (status.ts),
// unica fonte di verità condivisa anche con il badge di stato evento.
const STATUS_FILTER_ORDER: EventStatusFilter[] = [
  "upcoming",
  "open",
  "closed",
  "past",
];

const STATUS_FILTER_ITEMS: {
  id: EventStatusFilter | "all";
  label: string;
  icon: string;
}[] = [
  { id: ALL_STATUS, label: "Tutti gli stati", icon: "filter_list" },
  ...STATUS_FILTER_ORDER.map(id => ({
    id,
    label: eventStatusConfig[id].label,
    icon: eventStatusConfig[id].icon,
  })),
];

export interface IEventFilters {
  startDate: string;
  endDate: string;
  status: EventStatusFilter | "all";
  myBookings: boolean;
  campaignSlug: string;
}

export interface IEventsFilterBar {
  filters: IEventFilters;
  onFilterChange: (f: Partial<IEventFilters>) => void;
  /** Se presente, mostra il filtro per campagna con queste opzioni. */
  campaignItems?: { id: string; label: string }[];
}

const EventsFilterBar = ({
  filters,
  onFilterChange,
  campaignItems,
}: IEventsFilterBar) => (
  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 p-2">
    <FieldDate
      label="Data inizio"
      value={filters.startDate}
      onChange={v => onFilterChange({ startDate: v })}
    />
    <FieldDate
      label="Data fine"
      value={filters.endDate}
      onChange={v => onFilterChange({ endDate: v })}
    />
    <FieldSelect
      label="Stato"
      icon="filter_list"
      value={filters.status}
      items={STATUS_FILTER_ITEMS}
      onChange={value =>
        onFilterChange({
          status: value as EventStatusFilter | "all",
        })
      }
    />
    <div
      role="presentation"
      className="mt-5 flex min-h-[44px] cursor-pointer select-none items-center gap-2 rounded border border-border bg-input px-3 transition-all hover:border-primary"
      onClick={() => onFilterChange({ myBookings: !filters.myBookings })}
    >
      <Checkbox type={SelectType.CHECK} selected={filters.myBookings} />
      <Text children="Eventi a cui sono iscritto" />
    </div>
    {campaignItems && (
      <FieldSelect
        label="Campagna"
        icon="tower"
        placeholder="Tutte le campagne"
        value={filters.campaignSlug || undefined}
        items={campaignItems}
        onChange={value =>
          onFilterChange({ campaignSlug: (value as string) ?? "" })
        }
      />
    )}
  </div>
);

export default EventsFilterBar;
