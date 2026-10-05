import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";

export default function Loading() {
  return (
    <>
      <div className="flex shrink-0 flex-col items-center gap-4 rounded-xl bg-button px-6 pb-10 pt-12 sm:pb-12 sm:pt-16">
        <Skeleton className="size-20 opacity-20 sm:size-24" />
        <Skeleton className="mt-2 h-7 w-64 opacity-20" />
        <Skeleton className="h-4 w-20 rounded-full opacity-20" />
      </div>
      <Card className="flex-col items-stretch gap-3 p-5 sm:p-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-9 w-48" />
      </Card>
      <Skeleton className="h-5 w-40" />
      <Card className="flex-col items-stretch p-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </Card>
    </>
  );
}
