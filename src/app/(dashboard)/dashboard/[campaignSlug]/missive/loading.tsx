import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";
import MissiveRowSkeleton from "@/components/MissiveList/MissiveRowSkeleton";

export default function Loading() {
  return (
    <>
      <div className="min-h-[35px] mb-2 flex flex-wrap items-start justify-between gap-12">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-9 w-48 rounded" />
      </div>
      <Card className="flex flex-col items-stretch p-2">
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Skeleton className="h-9 w-32 rounded" />
            <Skeleton className="h-9 w-24 rounded" />
          </div>
          <Skeleton className="h-9 w-full rounded" />
          <Skeleton className="h-9 w-full rounded" />
        </div>
        <div className="min-h-0 flex-1 pt-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <MissiveRowSkeleton key={i} />
          ))}
        </div>
      </Card>
    </>
  );
}
