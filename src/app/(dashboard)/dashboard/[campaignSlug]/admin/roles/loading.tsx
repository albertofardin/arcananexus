import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";

export default function Loading() {
  return (
    <>
      <Skeleton className="mb-4 h-[35px] w-52" />
      <div className="min-h-[35px] mb-2 flex flex-wrap items-start justify-between gap-12">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-7 w-28 rounded-full" />
      </div>
      <Card className="flex-1 flex-col gap-3 p-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </Card>
    </>
  );
}
