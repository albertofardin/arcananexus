import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";
import DowntimeRowSkeleton from "@/components/DowntimeList/DowntimeRowSkeleton";

export default function Loading() {
  return (
    <>
      <div className="min-h-[35px] mb-2 flex flex-wrap items-start justify-between gap-12">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-9 w-40 rounded" />
      </div>
      <Card className="flex flex-col items-stretch p-2">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-full rounded" />
          <Card className="p-0">
            <Skeleton className="h-9 w-full rounded" />
          </Card>
        </div>
        <div className="min-h-0 flex-1 pt-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <DowntimeRowSkeleton key={i} />
          ))}
        </div>
      </Card>
    </>
  );
}
