"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface IBackground {
  color1?: string;
  color2?: string;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactElement | React.ReactNode;
}

const Background = React.forwardRef<HTMLDivElement, IBackground>(
  (
    {
      style,
      className,
      color1 = "var(--primary)",
      color2 = "var(--bg)",
      children,
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        style={{
          ...style,
          background: `linear-gradient(to right, ${color2} 0%, ${color1} 100%)`,
        }}
        className={cn(
          "relative flex h-inherit w-inherit flex-1 flex-col items-center m-0 p-0",
          className
        )}
      >
        {children}
      </div>
    );
  }
);

Background.displayName = "Background";

export default Background;
