"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
export type TextSize = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type TextWeight = "regular" | "lighter" | "bolder";

export interface IText {
  className?: string;
  style?: React.CSSProperties;
  children: string | React.ReactElement | React.ReactNode;
  size?: TextSize;
  weight?: TextWeight;
  ellipsis?: boolean;
  onClick?: (event: React.MouseEvent<HTMLParagraphElement>) => void;
}

const sizeMap: Record<TextSize, string> = {
  0: "text-xs",
  1: "text-sm",
  2: "text-base",
  3: "text-lg",
  4: "text-xl",
  5: "text-2xl",
  6: "text-3xl",
  7: "text-4xl",
  8: "text-5xl",
  9: "text-6xl",
  10: "text-7xl",
};

const weightMap: Record<NonNullable<IText["weight"]>, string> = {
  regular: "font-normal tracking-[0.015em]",
  lighter: "font-light tracking-[0.025em]",
  bolder: "font-bold tracking-[0.012em]",
};

const Text = ({
  className,
  style,
  children,
  size = 1,
  weight = "regular",
  ellipsis,
  onClick,
}: IText) => {
  return (
    <p
      role="presentation"
      style={style}
      onClick={onClick}
      className={cn(
        "m-0 text-fg antialiased",
        "arcanadesign-font leading-normal",
        "[text-rendering:optimizeLegibility]",
        sizeMap[size],
        weightMap[weight],
        ellipsis && "overflow-hidden whitespace-nowrap text-ellipsis",
        className
      )}
      children={children}
    />
  );
};

export default Text;
