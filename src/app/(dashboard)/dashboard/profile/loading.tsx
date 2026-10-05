import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";

const FieldRow = () => (
  <div className="space-y-1.5">
    <Skeleton className="h-3 w-24" />
    <Skeleton className="h-9 w-full rounded" />
  </div>
);

export default function Loading() {
  return (
    <>
      <div className="min-h-[35px] mb-2 space-y-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="relative flex flex-col items-center gap-4 rounded-lg bg-muted-bg px-6 py-8 text-center sm:flex-row sm:px-10 sm:text-left">
        <Skeleton className="h-[140px] w-[140px] shrink-0 rounded-full" />
        <div className="w-full space-y-2 sm:w-auto">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="flex-col items-stretch p-5 gap-3 justify-start">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-44" />
            </div>
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <FieldRow key={i} />
            ))}
          </div>
        </Card>

        <Card className="flex-col items-stretch p-5 gap-3 justify-start">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-60" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <FieldRow key={i} />
            ))}
          </div>
        </Card>

        <Card className="flex-col items-stretch p-5 gap-3 justify-start">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
          <Skeleton className="h-[52px] w-full rounded" />
          <Skeleton className="h-[52px] w-full rounded" />
        </Card>
      </div>
    </>
  );
}
