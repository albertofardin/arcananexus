// Stato di una segnalazione di Supporto (T-0xx): fonte di verità UNICA per
// id/label/icona/colore, stesso pattern di `DOWNTIME_STATUS_CONFIG` in
// `src/lib/downtime/status.ts` — sia lo schema Zod
// (`supportTicketStatusSchema` in `src/lib/validations/support.ts`) sia ogni
// componente UI (badge, select) importano da qui, mai duplicare le stringhe
// altrove. Nessuna direttiva "use client": importabile sia da Server
// Component/route sia da componenti client.
export const SUPPORT_TICKET_STATUSES = [
  "in_attesa",
  "in_lavorazione",
  "risolta",
  "chiusa",
] as const;

export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export interface SupportTicketStatusConfigEntry {
  label: string;
  icon: string;
  color: string;
}

export const SUPPORT_TICKET_STATUS_CONFIG: Record<
  SupportTicketStatus,
  SupportTicketStatusConfigEntry
> = {
  in_attesa: { label: "In attesa", icon: "hourglass", color: "#e68a2d" },
  in_lavorazione: {
    label: "In lavorazione",
    icon: "support_agent",
    color: "var(--info)",
  },
  risolta: { label: "Risolta", icon: "check_circle", color: "var(--succ)" },
  chiusa: { label: "Chiusa", icon: "cancel", color: "var(--muted-fg)" },
};
