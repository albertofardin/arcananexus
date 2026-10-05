import Skeleton from "@/components/_core/Skeleton";
import { cn } from "@/lib/utils";

const FieldRowSkeleton = ({ className }: { className?: string }) => (
  <div className={cn("space-y-1.5", className)}>
    <Skeleton className="h-3 w-24" />
    <Skeleton className="h-9 w-full rounded" />
  </div>
);

export default FieldRowSkeleton;
