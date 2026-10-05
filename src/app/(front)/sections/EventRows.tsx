"use client";

import { EventListRow } from "@/components/EventList";
import type { Event } from "@/lib/validations/event";
import { useSession } from "@/lib/auth-client";

/** Righe evento della home: cliccabili solo per utenti loggati, senza badge di stato. */
const EventRows = ({ events }: { events: Event[] }) => {
  const { data: session } = useSession();
  return events.map(event => (
    <EventListRow
      key={event.id}
      event={event}
      badges={false}
      linkable={!!session?.user}
    />
  ));
};

export default EventRows;
