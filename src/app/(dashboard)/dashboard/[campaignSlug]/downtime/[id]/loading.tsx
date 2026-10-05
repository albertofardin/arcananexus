import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";
import Divider from "@/components/_core/Divider";

export default function Loading() {
  return (
    <>
      <Skeleton className="h-[35px] w-40" />

      <div className="min-h-[35px] mb-2 flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-6 w-32 rounded-full" />
      </div>

      <Card className="flex-col items-stretch gap-4 p-4">
        <div className="flex flex-1 items-center gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <Divider />
        <Skeleton className="h-[140px] w-full rounded" />
      </Card>

      <Card className="flex-col items-stretch gap-3 p-3">
        <Skeleton className="h-9 w-40 rounded" />
        <Skeleton className="h-[100px] w-full rounded" />
        <Skeleton className="h-[80px] w-full rounded" />
        <Skeleton className="h-9 w-28 self-end rounded" />
      </Card>
    </>
  );
}
