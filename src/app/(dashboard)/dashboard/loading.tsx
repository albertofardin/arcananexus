import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";
import { EventListRowSkeleton } from "@/components/EventList";

export default function Loading() {
  return (
    <>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-stretch">
        <Skeleton className="min-h-[120px] flex-1 rounded-lg" />
        <Skeleton className="min-h-[120px] flex-1 rounded-lg" />
      </div>

      <Skeleton className="min-h-[90px] w-full rounded-xl" />

      <Card className="flex-col items-stretch p-5 flex-1 gap-3 justify-start">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
        <div className="gap-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[150px] rounded-xl sm:h-[160px]" />
          ))}
        </div>
      </Card>

      <Card className="flex-col items-stretch p-2 flex-1 gap-3 justify-start">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
        <div className="flex flex-col rounded-lg border border-solid border-border">
          {Array.from({ length: 4 }).map((_, i) => (
            <EventListRowSkeleton key={i} />
          ))}
        </div>
      </Card>
    </>
  );
}
