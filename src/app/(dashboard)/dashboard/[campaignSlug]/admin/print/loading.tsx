import Skeleton from "@/components/_core/Skeleton";

export default function Loading() {
  return (
    <>
      <Skeleton className="mb-4 h-[35px] w-52" />
      <div className="min-h-[35px] mb-2 space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-[180px] w-full rounded-lg" />
      <Skeleton className="h-[140px] w-full rounded-lg" />
    </>
  );
}
