import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";
import Divider from "@/components/_core/Divider";

export default function Loading() {
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-[35px] w-44" />
        <Skeleton className="h-9 w-32 rounded" />
      </div>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-32 rounded" />
      </div>
      <Card className="min-h-fit flex flex-col items-stretch justify-start p-0">
        <div className="flex flex-col p-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}>
              <div className="flex w-full items-center gap-3 p-2">
                <Skeleton className="h-9 w-9 rounded" />
                <Skeleton className="h-4 max-w-[240px] flex-1" />
              </div>
              <Divider className="mx-2" />
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
