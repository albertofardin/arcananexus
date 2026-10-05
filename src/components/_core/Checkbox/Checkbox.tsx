"use client";

import * as React from "react";
import Icon from "../Icon";
import { cn } from "@/lib/utils";

export enum SelectType {
  NONE = "NONE",
  RADIO = "RADIO",
  CHECK = "CHECK",
}

export interface ICheckbox {
  style?: React.CSSProperties;
  className?: string;
  size?: number;
  type: SelectType;
  color?: string;
  selected?: boolean;
  disabled?: boolean;
}

const Checkbox = ({
  style,
  className,
  size = 16,
  type,
  color,
  selected,
  disabled,
}: ICheckbox) => {
  if (type === SelectType.NONE) return null;

  const resolvedColor = color ?? "var(--primary)";

  return (
    <div
      style={{
        ...style,
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderColor: disabled
          ? "var(--muted-fg)"
          : selected
            ? resolvedColor
            : "var(--border)",
        backgroundColor: style?.backgroundColor ?? "var(--bg)",
      }}
      className={cn(
        "box-content flex items-center justify-center overflow-hidden rounded-[3px] border transition-all duration-150",
        type === SelectType.RADIO && "rounded-full",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center transition-all duration-150",
          selected
            ? "scale-100 opacity-100"
            : "pointer-events-none scale-75 opacity-0"
        )}
      >
        {type === SelectType.RADIO ? (
          <div
            style={{
              width: size - 4,
              height: size - 4,
              backgroundColor: disabled ? "var(--muted-fg)" : resolvedColor,
            }}
            className="rounded-full"
          />
        ) : (
          <div
            style={{
              width: size,
              height: size,
              backgroundColor: disabled ? "var(--muted-fg)" : resolvedColor,
            }}
            className="flex items-center justify-center rounded-[1px]"
          >
            <Icon
              className="text-bg"
              style={{ fontSize: size * 0.8 }}
              children="check"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Checkbox;
