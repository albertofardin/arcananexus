import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";

export default function Loading() {
  return (
    <>
      <div className="flex items-center justify-between">
        <Skeleton className="h-[35px] w-40" />
        <Skeleton className="h-9 w-[180px] rounded" />
      </div>
      <Skeleton className="h-8 w-64" />
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i} className="flex-col items-stretch gap-2 p-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-16 w-full rounded" />
        </Card>
      ))}
      <Card className="flex-col items-stretch gap-2 p-2">
        <Skeleton className="h-24 w-full rounded" />
        <Skeleton className="h-9 w-[200px] self-end rounded" />
      </Card>
    </>
  );
}
