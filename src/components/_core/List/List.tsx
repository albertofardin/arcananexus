"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface IList {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactElement | React.ReactNode;
}

const List = ({ className, style, children }: IList) => {
  return (
    <ul
      style={style}
      className={cn("m-0 overflow-auto py-2", className)}
      children={children}
    />
  );
};

export default List;
