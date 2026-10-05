export type EventStatus = "open" | "past" | "closed" | "upcoming";

export interface IEventDates {
  dateEventStart: Date;
  datePublicationStart: Date;
  datePublicationEnd: Date;
}

export function getEventStatus(event: IEventDates): EventStatus {
  const now = new Date();
  if (event.dateEventStart < now) return "past";
  if (now >= event.datePublicationStart && now <= event.datePublicationEnd)
    return "open";
  if (now < event.datePublicationStart) return "upcoming";
  return "closed";
}

interface EventStatusStyle {
  label: string;
  cta: string;
  icon: string;
  color: string;
}

// Il colore basta a Badge per calcolare sfondo e testo: nessuna classe da
// gestire qui.
export const eventStatusConfig: Record<EventStatus, EventStatusStyle> = {
  open: {
    label: "Iscrizioni Aperte",
    cta: "Iscriviti",
    icon: "thumb_up",
    color: "#22c55e",
  },
  past: {
    label: "Concluso",
    cta: "Vedi dettagli",
    icon: "event_available",
    color: "var(--muted-fg)",
  },
  closed: {
    label: "Iscrizioni Chiuse",
    cta: "Vedi dettagli",
    icon: "lock",
    color: "#ef4444",
  },
  upcoming: {
    label: "Prossimamente",
    cta: "Scopri di più",
    icon: "schedule",
    color: "#f59e0b",
  },
};
