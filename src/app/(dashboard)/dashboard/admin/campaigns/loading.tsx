import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";

export default function Loading() {
  return (
    <>
      <div className="min-h-[35px] mb-2 space-y-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Card className="min-h-fit flex flex-col items-stretch justify-start p-0">
        <div className="flex flex-col gap-1 p-2">
          <Skeleton className="h-[66px] w-full" />
          <Skeleton className="h-[66px] w-full" />
          <Skeleton className="h-[66px] w-full" />
        </div>
      </Card>
    </>
  );
}
