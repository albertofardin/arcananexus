import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";

export default function Loading() {
  return (
    <>
      <Skeleton className="mb-4 h-[35px] w-40" />
      <div className="min-h-[35px] mb-2 flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-8 w-56" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-44 rounded-full" />
          <Skeleton className="h-[38px] w-32 rounded" />
        </div>
      </div>
      <Card className="flex-col items-stretch gap-3 p-3">
        <Skeleton className="h-9 w-full rounded" />
        <Skeleton className="h-9 w-full rounded" />
        <Skeleton className="h-[180px] w-full rounded" />
        <Skeleton className="h-9 w-[200px] self-end rounded" />
      </Card>
    </>
  );
}
