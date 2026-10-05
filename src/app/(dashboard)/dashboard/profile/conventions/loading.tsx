import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";

const ConventionCardSkeleton = () => (
  <Card className="flex-col items-stretch gap-4 p-3 sm:flex-row sm:items-start sm:gap-6 sm:p-6">
    <Skeleton className="h-40 w-full rounded sm:h-44 sm:w-44" />
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-5 w-32 rounded-full" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <Skeleton className="h-8 w-24 rounded" />
        <Skeleton className="h-8 w-24 rounded" />
      </div>
    </div>
  </Card>
);

export default function Loading() {
  return (
    <>
      <div className="min-h-[35px] mb-2 space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-[420px] max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-3 pb-10 xl:grid-cols-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <ConventionCardSkeleton key={i} />
        ))}
      </div>
    </>
  );
}
