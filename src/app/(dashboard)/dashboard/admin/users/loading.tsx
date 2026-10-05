import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";
import Divider from "@/components/_core/Divider";

export default function Loading() {
  return (
    <>
      <div className="min-h-[35px] mb-2 space-y-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Card className="min-h-fit flex flex-col items-stretch justify-start p-0">
        <div className="flex flex-wrap items-center gap-3 p-3">
          <Skeleton className="h-9 min-w-[220px] flex-1 rounded" />
          <Skeleton className="h-9 w-[200px] rounded" />
          <Skeleton className="ml-auto h-5 w-16" />
        </div>
        <Divider />
        <div className="flex flex-col gap-1 p-3">
          <Skeleton className="h-[66px] w-full" />
          <Skeleton className="h-[66px] w-full" />
          <Skeleton className="h-[66px] w-full" />
        </div>
      </Card>
    </>
  );
}
