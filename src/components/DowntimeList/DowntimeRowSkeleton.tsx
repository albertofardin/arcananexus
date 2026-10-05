import Divider from "../_core/Divider";

const DowntimeRowSkeleton = () => (
  <>
    <div className="flex items-center gap-2 p-2">
      <div className="h-9 w-9 shrink-0 animate-pulse rounded bg-muted-bg" />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-1">
          <div className="h-2.5 w-16 animate-pulse rounded bg-muted-bg" />
          <div className="h-2.5 w-20 animate-pulse rounded bg-muted-bg" />
          <div className="flex-1" />
          <div className="h-2.5 w-10 shrink-0 animate-pulse rounded bg-muted-bg" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3.5 w-40 max-w-full flex-1 animate-pulse rounded bg-muted-bg" />
          <div className="h-5 w-5 shrink-0 animate-pulse rounded-full bg-muted-bg" />
        </div>
      </div>
    </div>
    <Divider className="last:hidden mx-2" />
  </>
);

export default DowntimeRowSkeleton;
