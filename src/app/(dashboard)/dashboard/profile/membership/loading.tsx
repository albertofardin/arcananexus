import Skeleton from "@/components/_core/Skeleton";

export default function Loading() {
  return (
    <>
      <div className="min-h-[35px] mb-2 space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton
        className="mx-auto w-full max-w-md rounded-2xl"
        style={{ aspectRatio: "1.586", minHeight: 200 }}
      />
      <div className="mt-10 flex flex-col gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded" />
        ))}
      </div>
    </>
  );
}
