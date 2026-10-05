import Skeleton from "@/components/_core/Skeleton";
import Card from "@/components/_core/Card";

// Note, Anagrafica, Background, Talenti, Downtime, Missiva
const ROWS = 6;

const CharacterEditorSkeleton = () => (
  <>
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-stretch sm:gap-6">
      <Skeleton className="h-[90px] w-[90px] shrink-0 rounded" />
      <div className="flex w-full min-w-0 flex-col justify-between gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Skeleton className="h-7 w-1/2 max-w-[240px]" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <Skeleton className="h-4 w-1/3 max-w-[140px]" />
      </div>
    </div>

    {Array.from({ length: ROWS }).map((_, i) => (
      <Card
        key={i}
        className="min-h-[40px] items-center justify-start gap-4 px-4"
      >
        <Skeleton className="h-5 w-5 rounded-sm" />
        <Skeleton className="h-4 max-w-[160px] flex-1" />
        <div className="flex-1" />
        <Skeleton className="h-5 w-5 rounded-sm" />
      </Card>
    ))}
  </>
);

export default CharacterEditorSkeleton;
