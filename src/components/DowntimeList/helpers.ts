import { IListItem } from "../_core/ListItem";
import type { DowntimeAuthorOption } from "@/lib/validations/downtime";
import {
  DOWNTIME_STATUSES,
  DOWNTIME_STATUS_CONFIG,
  type DowntimeStatus,
} from "@/lib/downtime/status";

export const parseAuthorParam = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

// A differenza di `parseAuthorParam` non è un numero: `category` (T-0xx, fix
// catalogo globale) è la stringa libera salvata in `Action.actionData.category`.
export const parseCategoryParam = (value: string | null): string | undefined =>
  value ? value : undefined;

export const getAuthorFieldItems = (
  allId: string,
  authors: DowntimeAuthorOption[]
): IListItem[] => [
  { id: allId, label: "Tutti" },
  ...authors.map((author): IListItem => ({
    id: author.id,
    label: author.name,
    avatar: author.avatar,
    avatarText: author.name,
  })),
];

export const getCategoryFieldItems = (
  allId: string,
  categories: string[]
): IListItem[] => [
  { id: allId, label: "Tutte" },
  ...categories.map((category): IListItem => ({
    id: category,
    label: category,
  })),
];

// A differenza di `parseCategoryParam` valida contro `DOWNTIME_STATUSES`
// (fonte di verità unica, `src/lib/downtime/status.ts`): un valore in URL non
// riconosciuto (link condiviso stantio, param manomesso) resta "nessun
// filtro" invece di un valore invalido silenzioso.
export const parseStatusParam = (
  value: string | null
): DowntimeStatus | undefined =>
  value && (DOWNTIME_STATUSES as readonly string[]).includes(value)
    ? (value as DowntimeStatus)
    : undefined;

export const getStatusFieldItems = (allId: string): IListItem[] => [
  { id: allId, label: "Tutti" },
  ...DOWNTIME_STATUSES.map((status): IListItem => ({
    id: status,
    color: DOWNTIME_STATUS_CONFIG[status].color,
    label: DOWNTIME_STATUS_CONFIG[status].label,
    labelStyle: { color: DOWNTIME_STATUS_CONFIG[status].color },
    icon: DOWNTIME_STATUS_CONFIG[status].icon,
    iconStyle: { color: DOWNTIME_STATUS_CONFIG[status].color },
  })),
];

// Stesso identico ruolo di `getEventFieldItems`/`toDateInputValue` in
// `MissiveList/helpers.ts`: duplicati qui (non importati da lì) per
// tenere le due liste disaccoppiate, stessa scelta del componente sorgente.
export const getEventFieldItems = (
  allId: string,
  events: { id: number; name: string; dateEventStart: Date }[]
): IListItem[] => {
  const chronological = [...events].sort(
    (a, b) => a.dateEventStart.getTime() - b.dateEventStart.getTime()
  );
  const numberById = new Map(
    chronological.map((event, index) => [event.id, index + 1])
  );

  const mostRecentFirst = [...events].sort(
    (a, b) => b.dateEventStart.getTime() - a.dateEventStart.getTime()
  );

  return [
    { id: allId, label: "Nessuno" },
    ...mostRecentFirst.map(event => ({
      id: event.id,
      label: `${numberById.get(event.id)}. ${event.name}`,
    })),
  ];
};

export const toDateInputValue = (date: Date): string =>
  date.toISOString().slice(0, 10);

export const parsePageParam = (value: string | null): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
};
