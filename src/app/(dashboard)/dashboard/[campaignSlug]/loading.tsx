import Skeleton from "@/components/_core/Skeleton";
import { EventListRowSkeleton } from "@/components/EventList";
import Card from "@/components/_core/Card";

export default function Loading() {
  return (
    <>
      {/* BtnCampaign + nome campagna */}
      <div className="flex gap-3 items-end pt-2">
        <Skeleton className="h-[90px] w-[227px] rounded" />
        <Skeleton className="h-8 w-40" />
      </div>

      {/* Prossimi eventi (EventListRow) */}
      <Card className="flex-col items-stretch justify-start p-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <EventListRowSkeleton key={i} />
        ))}
      </Card>

      {/* Personaggi attivi (CardCharacterSummary): elenco compatto dentro un
          HeroBanner, un rigo per personaggio (avatar, nome, XP/downtime/missive). */}
      <div
        className="flex flex-col gap-0 rounded p-2"
        style={{ backgroundColor: "rgba(198, 204, 212, 0.15)" }}
      >
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2 pr-4">
            <Skeleton className="h-12 w-12 shrink-0 rounded" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-10" />
          </div>
        ))}
      </div>
    </>
  );
}
