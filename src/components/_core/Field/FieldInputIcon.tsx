"use client";

import * as React from "react";
import Icon from "../Icon";
import { cn } from "@/lib/utils";

const FieldInputIcon = ({
  icon,
  className,
  style,
  onClick,
}: {
  icon?: string;
  className: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}) => {
  if (!icon) return null;
  return (
    <Icon
      className={cn(
        "text-muted-fg ml-2 flex items-center justify-center",
        onClick && "cursor-pointer",
        className
      )}
      style={style}
      children={icon}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={
        onClick &&
        (event => {
          event.stopPropagation();
          onClick();
        })
      }
    />
  );
};

export default FieldInputIcon;
