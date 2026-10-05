import Link from "next/link";
import Image from "next/image";
import Text from "../_core/Text";
import Icon from "../_core/Icon";
import Badge from "../_core/Badge";
import { getEventStatus, eventStatusConfig } from "./status";
import type { Event } from "@/lib/validations/event";
import { routes } from "@/app/routes";
import { themeColors } from "@/app/themes";
import Divider from "@/components/_core/Divider";

const ARCANA_DOMINE_LOGO = "/mobile/icon-192.png";

const monthShort = (date: Date) =>
  new Intl.DateTimeFormat("it-IT", { month: "short" })
    .format(date)
    .replace(".", "")
    .toUpperCase();

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const eventDateLabel = (start: Date, end: Date) => {
  if (isSameDay(start, end)) return `${start.getDate()} ${monthShort(start)}`;
  if (start.getMonth() === end.getMonth())
    return `${start.getDate()} – ${end.getDate()} ${monthShort(start)}`;
  return `${start.getDate()} ${monthShort(start)} – ${end.getDate()} ${monthShort(end)}`;
};

export interface IEventListRow {
  event: Event;
  campaignName?: boolean;
  /** Mostra i badge di stato (iscrizioni aperte, prossimamente, …). */
  badges?: boolean;
  /** Se false la riga non è cliccabile (es. home pubblica per utenti anonimi). */
  linkable?: boolean;
}

const EventListRow = ({
  event,
  campaignName = true,
  badges = true,
  linkable = true,
}: IEventListRow) => {
  const href = routes.event(event.campaignSlug, event.id);
  const status = badges ? eventStatusConfig[getEventStatus(event)] : null;
  const className =
    "group flex flex-wrap items-center gap-3 p-3 rounded sm:flex-nowrap sm:gap-4";
  const content = (
    <>
      {/* mobile: banner a tutta larghezza sopra la riga; da sm in su miniatura a sinistra */}
      <div
        className="relative aspect-[3/1] w-full shrink-0 rounded overflow-hidden sm:aspect-video sm:h-16 sm:w-auto"
        style={
          event.image
            ? undefined
            : {
                backgroundColor: event.campaignColor
                  ? `color-mix(in srgb, ${themeColors.find(t => t.id === event.campaignColor)?.swatch} 20%, var(--muted-bg))`
                  : "var(--muted-bg)",
              }
        }
      >
        <Image
          src={event.image || event.campaignLogo || ARCANA_DOMINE_LOGO}
          alt=""
          fill
          sizes="(min-width: 640px) 128px, 100vw"
          className={event.image ? "object-cover" : "object-contain p-2"}
        />
      </div>

      <div className="flex w-20 shrink-0 flex-col items-start leading-none sm:w-28">
        <Text
          size={0}
          weight="bolder"
          className="text-muted-fg"
          children={
            event.dateEventStart.getFullYear() ===
            event.dateEventEnd.getFullYear()
              ? event.dateEventStart.getFullYear()
              : `${event.dateEventStart.getFullYear()}–${event.dateEventEnd.getFullYear()}`
          }
        />
        <Text
          size={3}
          weight="bolder"
          className="mt-0.5"
          children={eventDateLabel(event.dateEventStart, event.dateEventEnd)}
        />
      </div>

      {/* mobile: badge sotto il testo; da sm in su `contents` li riporta in riga */}
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:contents">
        <div className="min-w-0 flex-1">
          {campaignName && (
            <Text
              size={0}
              className="text-muted-fg"
              ellipsis
              children={event.campaignName ?? "Arcana Domine"}
            />
          )}
          <Text size={2} weight="bolder" ellipsis children={event.name} />
          <div className="flex items-center gap-1 text-muted-fg">
            <Icon size="sm" children="location" />
            <Text ellipsis children={event.place} />
          </div>
        </div>

        <div className="flex flex-wrap gap-1 empty:hidden sm:contents">
          {badges && event.visibility === "hidden" && (
            <Badge label="Nascosto" icon="visibility_off" />
          )}

          {status && (
            <Badge
              label={status.label}
              icon={status.icon}
              color={status.color}
            />
          )}
        </div>
      </div>

      {linkable && (
        <Icon
          className="shrink-0 text-muted-fg transition-transform"
          children="chevron_right"
        />
      )}
    </>
  );

  return (
    <>
      {linkable ? (
        <Link href={href as never} className={`${className} hover:bg-accent`}>
          {content}
        </Link>
      ) : (
        <div className={className}>{content}</div>
      )}
      <Divider className="last:hidden mx-2" />
    </>
  );
};

export const EventListRowSkeleton = () => (
  <>
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
      <div className="aspect-[3/1] w-full animate-pulse rounded bg-muted-bg sm:hidden" />

      <div className="flex w-11 shrink-0 flex-col items-center gap-1">
        <div className="h-4 w-4 animate-pulse rounded bg-muted-bg" />
      </div>

      <div className="w-px shrink-0 self-stretch bg-border" />

      <div className="h-8 w-8 shrink-0 animate-pulse rounded bg-muted-bg" />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="h-2.5 w-20 animate-pulse rounded bg-muted-bg" />
        <div className="h-3.5 w-40 max-w-full animate-pulse rounded bg-muted-bg" />
        <div className="h-2.5 w-28 max-w-full animate-pulse rounded bg-muted-bg" />
      </div>
    </div>
    <Divider className="last:hidden mx-2" />
  </>
);

export default EventListRow;
