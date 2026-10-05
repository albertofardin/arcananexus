import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";
import Divider from "@/components/_core/Divider";
import { EventListRowSkeleton } from "@/components/EventList";

export default function Loading() {
  return (
    <>
      <div className="min-h-[35px] mb-2 space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-56" />
      </div>
      <Card className="min-h-fit flex flex-col items-stretch justify-start p-0">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4 p-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-9 w-full rounded" />
            </div>
          ))}
          <Skeleton className="mt-5 h-[44px] w-full rounded" />
        </div>
        <Divider />
        <div className="mx-4 py-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <EventListRowSkeleton key={i} />
          ))}
        </div>
      </Card>
    </>
  );
}
