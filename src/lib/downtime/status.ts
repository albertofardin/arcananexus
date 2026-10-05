// Stato di approvazione di una downtime (T-0xx): fonte di verità UNICA per
// id/label/icona/colore — sia lo schema Zod (`downtimeStatusSchema` in
// `src/lib/validations/downtime.ts`) sia ogni componente UI (badge, select,
// filtro) importano da qui, mai duplicare le stringhe altrove. Nessuna
// direttiva "use client": importabile sia da Server Component/route sia da
// componenti client.
export const DOWNTIME_STATUSES = ["waiting", "approve", "refuse"] as const;

export type DowntimeStatus = (typeof DOWNTIME_STATUSES)[number];

export interface DowntimeStatusConfigEntry {
  label: string;
  icon: string;
  color: string;
}

// Colore come singola CSS var: `Badge` calcola da sé sfondo/bordo via
// `color-mix`, nessuna variante dark/light da gestire qui (a differenza di
// `BadgeCharacterStatus/status.ts`).
export const DOWNTIME_STATUS_CONFIG: Record<
  DowntimeStatus,
  DowntimeStatusConfigEntry
> = {
  waiting: {
    label: "In valutazione",
    icon: "hourglass",
    color: "#e68a2d",
  },
  approve: { label: "Approvata", icon: "check_circle", color: "var(--succ)" },
  refuse: { label: "Rifiutata", icon: "cancel", color: "var(--fail)" },
};
