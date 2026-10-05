import Reveal from "../Reveal";
import Kicker from "./Kicker";
import EventRows from "./EventRows";
import { prisma } from "@/lib/db";
import { listPublishedEvents } from "@/lib/repositories/event.repository";
import { eventSchema } from "@/lib/validations/event";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";
import { EmptyCard } from "@/components/Feedback";

const MAX_UPCOMING_EVENTS = 100;

/** Sezione "Eventi": prossimi eventi pubblicati, stessa lista della dashboard. */
const Events = async () => {
  // dateEventStart è una data pura (mezzanotte UTC): gli eventi di oggi restano visibili.
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  const { events } = await listPublishedEvents(prisma, {
    orgSlug: ARCANA_DOMINE_SLUG,
    startDate: startOfToday,
    sortDirection: "asc",
    page: 1,
    pageSize: MAX_UPCOMING_EVENTS,
  });

  const upcomingEvents = events.map(event =>
    eventSchema.parse({
      id: event.id,
      name: event.name,
      place: event.place ?? "",
      image: event.image,
      dateEventStart: event.dateEventStart,
      datePublicationStart: event.datePublicationStart,
      datePublicationEnd: event.datePublicationEnd,
      dateEventEnd: event.dateEventEnd,
      price: Number(event.price),
      visibility: event.visibility,
      campaignName: event.campaign?.name ?? null,
      campaignSlug: event.campaign?.slug ?? null,
      campaignColor: event.campaign?.color ?? null,
      campaignLogo: event.campaign?.logo ?? null,
      bookingCount: event._count.bookings,
    })
  );

  return (
    <section
      id="eventi"
      className="scroll-mt-[84px] bg-ad-bg-alt border-t border-b border-ad-border"
    >
      <div className="max-w-[1180px] mx-auto py-[clamp(48px,4vw,88px)] px-[clamp(20px,4vw,48px)]">
        <Reveal className="flex flex-wrap items-end justify-between gap-5 mb-[clamp(32px,4vw,52px)]">
          <div>
            <Kicker>Calendario</Kicker>
            <h2 className="font-front font-bold text-[clamp(30px,4vw,52px)] leading-[1.04] tracking-[-0.02em] m-0">
              Prossimi eventi
            </h2>
          </div>
        </Reveal>

        <Reveal className="flex flex-col p-2 bg-white border border-ad-border rounded-[12px] shadow-[0_12px_32px_rgba(20,18,16,0.06)]">
          {upcomingEvents.length > 0 ? (
            <EventRows events={upcomingEvents} />
          ) : (
            <EmptyCard
              icon="event_busy"
              title="Nessun evento in programma"
              className="border-0 p-0"
            />
          )}
        </Reveal>
      </div>
    </section>
  );
};

export default Events;
