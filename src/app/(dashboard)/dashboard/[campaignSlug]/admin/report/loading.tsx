import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";
import Divider from "@/components/_core/Divider";

function ReportCategoryCardSkeleton() {
  return (
    <Card className="flex-col items-stretch justify-start gap-3 p-3">
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-5 rounded-sm" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Divider />
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex min-w-[160px] flex-1 flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-6" />
            </div>
          ))}
          <Divider className="my-1" />
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-6" />
          </div>
        </div>
        <Skeleton className="h-[180px] w-[180px] shrink-0 m-auto rounded-full" />
      </div>
    </Card>
  );
}

export default function Loading() {
  return (
    <>
      <Skeleton className="mb-4 h-[35px] w-52" />
      <div className="min-h-[35px] mb-2 space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <Card className="p-2 gap-2">
        <Skeleton className="h-9 w-[260px] rounded" />
        <Skeleton className="h-9 w-[150px] rounded" />
        <div className="flex-1" />
        <Skeleton className="h-9 w-[150px] rounded" />
        <Skeleton className="h-9 w-[150px] rounded" />
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <ReportCategoryCardSkeleton key={i} />
        ))}
      </div>
    </>
  );
}
