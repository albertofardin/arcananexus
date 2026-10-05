import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";
import Divider from "@/components/_core/Divider";

export default function Loading() {
  return (
    <>
      <Skeleton className="mb-4 h-[35px] w-52" />
      <div className="min-h-[35px] mb-2 flex flex-wrap items-start justify-between gap-12">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-9 w-48 rounded" />
      </div>
      <Card className="min-h-fit flex flex-col items-stretch justify-start p-0">
        <div className="flex flex-wrap items-center gap-2 p-2">
          <Skeleton className="h-9 min-w-[220px] flex-1 rounded" />
          <Skeleton className="h-9 w-[180px] rounded" />
          <Skeleton className="h-9 w-[180px] rounded" />
          <Skeleton className="ml-auto h-5 w-20" />
        </div>
        <Divider />
        <div className="flex flex-col p-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded p-3">
              <Skeleton className="h-12 w-12 rounded" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="hidden h-6 w-32 rounded-full sm:block" />
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
