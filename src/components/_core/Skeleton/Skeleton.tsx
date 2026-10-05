import * as React from "react";
import { cn } from "@/lib/utils";

export interface ISkeleton {
  className?: string;
  style?: React.CSSProperties;
}

/** Placeholder animato mostrato durante il caricamento */
const Skeleton = ({ className, style }: ISkeleton) => (
  <div
    style={{ backgroundColor: "rgba(198, 204, 212, 0.25)", ...style }}
    className={cn("animate-pulse rounded shrink-0 ", className)}
  />
);

export default Skeleton;
