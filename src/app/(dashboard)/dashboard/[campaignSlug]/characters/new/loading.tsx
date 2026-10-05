import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";

const FieldRowSkeleton = ({ tall }: { tall?: boolean }) => (
  <div className="space-y-1.5">
    <Skeleton className="h-3 w-24" />
    <Skeleton
      className={tall ? "h-[180px] w-full rounded" : "h-9 w-full rounded"}
    />
  </div>
);

export default function Loading() {
  return (
    <>
      <Skeleton className="mb-4 h-[35px] w-40" />
      <div className="min-h-[35px] mb-2 space-y-2">
        <Skeleton className="h-8 w-56" />
      </div>
      <Card className="flex-col items-stretch p-2 gap-3">
        <FieldRowSkeleton />
        <FieldRowSkeleton />
        <FieldRowSkeleton />
        <div className="relative">
          <Skeleton className="absolute top-0 right-1 z-10 h-6 w-16 rounded-full" />
          <FieldRowSkeleton />
        </div>
        <FieldRowSkeleton tall />
      </Card>
    </>
  );
}
