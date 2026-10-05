import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";

export default function Loading() {
  return (
    <>
      <Skeleton className="mb-4 h-[35px] w-52" />
      <div className="min-h-[35px] mb-2 flex flex-wrap items-start justify-between gap-12">
        <div className="space-y-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-9 w-44 rounded" />
      </div>
      <Card className="min-h-fit flex flex-col items-stretch justify-start p-0">
        <div className="min-h-0 flex-1 overflow-y-auto flex flex-col p-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[60px] w-full mb-1" />
          ))}
        </div>
      </Card>
    </>
  );
}
