import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";

const PersonSkeleton = () => (
  <div className="flex items-center gap-2">
    <Skeleton className="h-9 w-9 shrink-0 rounded" />
    <div className="space-y-1.5">
      <Skeleton className="h-4 w-20 rounded-full" />
      <Skeleton className="h-3 w-24" />
    </div>
  </div>
);

export default function Loading() {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-[35px] w-40" />
        <div className="flex items-center gap-2">
          <PersonSkeleton />
          <PersonSkeleton />
        </div>
      </div>

      <Skeleton className="ml-2 h-8 w-72 max-w-full" />

      <Card className="flex-col items-stretch gap-2 p-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 shrink-0 rounded" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <Skeleton className="h-[140px] w-full rounded" />
      </Card>
    </>
  );
}
