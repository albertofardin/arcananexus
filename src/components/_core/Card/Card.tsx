"use client";

import * as React from "react";
import BtnBase, { IBtnBase } from "../BtnBase";
import { cn } from "@/lib/utils";

export interface ICard extends IBtnBase {
  elevation?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

const elevationMap: Record<NonNullable<ICard["elevation"]>, string> = {
  0: "shadow-none border-0",
  1: "shadow-none border",
  2: "shadow-sm   border",
  3: "shadow      border",
  4: "shadow-md   border",
  5: "shadow-lg   border",
  6: "shadow-xl   border",
  7: "shadow-2xl  border",
};

const Card = React.forwardRef<HTMLDivElement, ICard>((prop, ref) => {
  const { className, style, elevation = 1, ...other } = prop;

  return (
    <BtnBase
      {...other}
      ref={ref}
      style={style}
      className={cn(
        "flex items-center justify-center rounded-xl",
        "bg-card",
        "border-border border-solid",
        elevationMap[elevation],
        className
      )}
    />
  );
});

Card.displayName = "Card";

export default Card;
