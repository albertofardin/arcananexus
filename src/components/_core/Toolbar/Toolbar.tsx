"use client";

import * as React from "react";
import BtnBase from "../BtnBase";
import { cn } from "@/lib/utils";

export interface IToolbar {
  color?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  children?: React.ReactElement | React.ReactNode;
}

const Toolbar = React.forwardRef<HTMLDivElement, IToolbar>((props, ref) => {
  const { className, ...other } = props;
  return (
    <BtnBase
      ref={ref}
      {...other}
      className={cn(
        "relative box-border flex h-[50px] min-h-[50px] w-full flex-row items-center px-[15px]",
        className
      )}
    />
  );
});

Toolbar.displayName = "Toolbar";

export default Toolbar;
