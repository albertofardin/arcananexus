"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface IDivider {
  className?: string;
  style?: React.CSSProperties;
  color?: string;
}

const Divider = ({ className, style, color }: IDivider) => {
  return (
    <div
      style={{
        ...style,
        backgroundColor: color,
      }}
      className={cn("h-px min-h-px max-h-px w-auto bg-border", className)}
    />
  );
};

export default Divider;
