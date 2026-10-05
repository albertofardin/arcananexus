import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";

export default function Loading() {
  return (
    <>
      <Skeleton className="mb-4 h-[35px] w-52" />
      <div className="min-h-[35px] mb-2 flex flex-wrap items-start justify-between gap-12">
        <div className="space-y-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
      </div>
      <Card className="min-h-fit flex flex-col items-stretch justify-start p-0">
        <div className="min-h-0 flex-1 overflow-y-auto flex flex-col p-2">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[84px] w-full" />
            <Skeleton className="h-[84px] w-full" />
            <Skeleton className="h-[84px] w-full" />
          </div>
        </div>
      </Card>
    </>
  );
}
