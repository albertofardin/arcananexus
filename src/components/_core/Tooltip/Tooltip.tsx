"use client";

import * as React from "react";
import {
  Tooltip as ShadcnTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./primitives";
import { useIsMobile } from "@/hooks/use-mobile";

const RenderText = ({
  value,
}: {
  value: string | string[] | React.ReactElement;
}) => {
  if (typeof value === "string") {
    return <p>{value}</p>;
  }

  if (Array.isArray(value)) {
    return (
      <>
        {value.map((t, i) => (
          <p key={i}>{t}</p>
        ))}
      </>
    );
  }

  return value;
};

export interface ITooltip {
  open?: boolean;
  title?: string | string[] | React.ReactElement;
  place?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode | React.ReactElement;
}

const Tooltip = ({ open, title, place = "top", children }: ITooltip) => {
  const isMobile = useIsMobile();
  if (!title || isMobile) return children;
  return (
    <TooltipProvider>
      <ShadcnTooltip
        {...(open !== undefined ? { open } : {})}
        delayDuration={0}
      >
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={place} className="max-w-[60vw] z-[9999]">
          <div className="flex flex-col text-xs leading-relaxed">
            <RenderText value={title} />
          </div>
        </TooltipContent>
      </ShadcnTooltip>
    </TooltipProvider>
  );
};

export default Tooltip;
