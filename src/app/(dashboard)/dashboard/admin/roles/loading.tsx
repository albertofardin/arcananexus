import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";

export default function Loading() {
  return (
    <>
      <div className="min-h-[35px] mb-2 space-y-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="min-h-0 flex-1 grid grid-cols-1 gap-2 lg:grid-cols-[320px_1fr] lg:grid-rows-1">
        <Card className="flex-1 flex-col items-start gap-3 p-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </Card>
        <Card className="flex-1 flex-col items-start gap-3 p-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </Card>
      </div>
    </>
  );
}
