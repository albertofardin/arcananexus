import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";

export default function Loading() {
  return (
    <>
      <div className="min-h-[35px] mb-2 space-y-2">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Card className="min-h-fit flex flex-col items-stretch justify-start p-0">
        <div className="p-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex w-full items-center gap-3 p-3">
              <Skeleton className="h-12 w-12 shrink-0 rounded" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64" />
              </div>
              <Skeleton className="h-5 w-5 rounded shrink-0" />
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
