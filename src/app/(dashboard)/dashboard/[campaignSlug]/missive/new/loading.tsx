import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";

export default function Loading() {
  return (
    <>
      <Skeleton className="h-[35px] w-40" />
      <div className="min-h-[35px] mb-2 space-y-2">
        <Skeleton className="h-8 w-44" />
      </div>
      <div className="flex flex-col gap-4">
        <Card className="flex-col items-stretch gap-2 p-3">
          <Skeleton className="h-9 w-full rounded" />
        </Card>
        <Card className="flex-col items-stretch gap-3 p-3">
          <Skeleton className="h-9 w-full rounded" />
          <Skeleton className="h-9 w-full rounded" />
          <Skeleton className="h-[140px] w-full rounded" />
          <Skeleton className="h-9 w-[200px] self-end rounded" />
        </Card>
      </div>
    </>
  );
}
