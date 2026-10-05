import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";
import Divider from "@/components/_core/Divider";

function HeroSectionSkeleton() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="h-[42px] w-[42px] rounded" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
    </div>
  );
}

function PausableFeatureCardSkeleton() {
  return (
    <Card className="flex-col items-stretch gap-3 p-2">
      <HeroSectionSkeleton />
      <div className="w-full space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-3">
          <Skeleton className="h-[22px] w-[100px] rounded-full" />
          <Skeleton className="h-4 flex-1" />
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Skeleton className="h-9 w-[140px] rounded" />
          <Skeleton className="h-9 w-[140px] rounded" />
        </div>
      </div>
    </Card>
  );
}

export default function Loading() {
  return (
    <>
      <Skeleton className="mb-4 h-[35px] w-52" />
      <div className="min-h-[35px] mb-2 space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <Card className="flex-col items-stretch gap-3 p-2">
        <HeroSectionSkeleton />
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-9 w-[160px] rounded" />
          <Skeleton className="h-9 w-[160px] rounded" />
          <div className="flex-1" />
          <Skeleton className="h-9 w-[220px] rounded" />
        </div>
      </Card>

      <PausableFeatureCardSkeleton />
      <PausableFeatureCardSkeleton />

      <Card className="flex-col items-stretch gap-3 p-2">
        <HeroSectionSkeleton />
        <div className="w-full space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <Skeleton className="h-9 w-full rounded sm:flex-1" />
          <Skeleton className="h-9 w-full rounded sm:flex-[3]" />
        </div>
        <Card className="flex w-full flex-col items-stretch p-0">
          <div className="flex items-center gap-3 px-2 py-2">
            <Skeleton className="h-5 w-5 rounded-sm" />
            <Skeleton className="h-9 flex-[3] rounded" />
            <Skeleton className="h-9 flex-1 rounded" />
          </div>
          <Divider />
          <div className="flex flex-col p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <Skeleton className="h-5 w-5 rounded-sm" />
                <Skeleton className="h-8 w-8 rounded" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </Card>
        <div className="flex w-full items-center justify-between">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-9 w-[200px] rounded" />
        </div>
      </Card>
    </>
  );
}
