import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";

export default function Loading() {
  return (
    <>
      <Skeleton className="mb-4 h-[35px] w-40" />
      <div className="min-h-[35px] mb-2 flex flex-wrap items-start justify-between gap-12">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-9 w-28 rounded" />
      </div>
      <Card className="min-h-fit flex flex-col items-stretch justify-start p-6 gap-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </Card>
    </>
  );
}
