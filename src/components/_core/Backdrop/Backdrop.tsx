"use client";

import * as React from "react";
import Portal from "../Portal";
import { cn } from "@/lib/utils";

export interface IBackdrop {
  className?: string;
  style?: React.CSSProperties;
  open?: boolean;
  invisible?: boolean;
  onClick?: (event: React.MouseEvent) => void;
}

const Backdrop = ({
  className,
  style,
  open,
  invisible,
  onClick,
}: IBackdrop) => {
  const cbClick = React.useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      onClick?.(event);
    },
    [onClick]
  );

  if (!open) return null;

  return (
    <Portal>
      <div
        role="presentation"
        style={style}
        className={cn(
          "absolute left-0 top-0 h-full w-full select-none",
          invisible ? "bg-transparent" : "bg-black/60",
          className
        )}
        onClick={cbClick}
        onContextMenu={cbClick}
      />
    </Portal>
  );
};

export default Backdrop;
