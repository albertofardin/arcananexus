"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const getPathStyle = (
  value: number,
  variant: "determinate" | "indeterminate"
): React.CSSProperties => {
  const v = variant === "indeterminate" ? 25 : value;
  const length = 282.78302001953125;
  const to = length * ((100 - v) / 100);

  return {
    strokeDashoffset: Math.max(0, to),
  };
};

export interface ICircularProgress {
  style?: React.CSSProperties;
  className?: string;
  variant?: "determinate" | "indeterminate";
  size?: number;
  color?: string;
  value?: number;
  thickness?: number;
}

const CircularProgress = ({
  style,
  className,
  variant = "indeterminate",
  size = 50,
  color = "var(--primary)",
  value = 0,
  thickness = 6,
}: ICircularProgress) => {
  return (
    <svg
      className={cn(
        "inline-flex align-middle",
        variant === "indeterminate" && "animate-spin",
        className
      )}
      style={{
        ...style,
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        maxWidth: size,
        maxHeight: size,
      }}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
    >
      <circle
        r="45"
        cx="50"
        cy="50"
        fill="none"
        strokeWidth={thickness}
        stroke={`color-mix(in srgb, ${color} 25%, transparent)`}
      />

      <path
        d="M5,50a45,45 0 1,0 90,0a45,45 0 1,0 -90,0"
        fill="none"
        stroke={color}
        strokeWidth={thickness}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="282.78302001953125"
        style={{
          ...getPathStyle(value, variant),
          transformOrigin: "center",
          transform: "rotate(-90deg) scaleX(-1)",
          transition:
            "stroke-dashoffset 1s cubic-bezier(0.43, 0.41, 0.22, 0.91)",
        }}
      />
    </svg>
  );
};

export default CircularProgress;
