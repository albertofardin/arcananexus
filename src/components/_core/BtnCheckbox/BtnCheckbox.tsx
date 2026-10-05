"use client";

import * as React from "react";
import Text from "../Text";
import Checkbox, { SelectType } from "../Checkbox";
import BtnBase from "../BtnBase";
import { cn } from "@/lib/utils";

export interface IBtnCheckbox {
  className?: string;
  style?: React.CSSProperties;
  color?: string;
  disabled?: boolean;
  selected?: boolean;
  children?: React.ReactElement | React.ReactNode;
  checkboxType?: SelectType;
  checkboxStyle?: React.CSSProperties;
  checkboxClassName?: string;
  label: string | React.ReactElement;
  labelStyle?: React.CSSProperties;
  labelClassName?: string;
  tooltip?: string | string[];
  onClick?: (newCheck: boolean) => void;
}

const BtnCheckbox = ({
  className,
  style,
  color,
  disabled,
  selected,
  children,
  checkboxType = SelectType.CHECK,
  checkboxStyle,
  checkboxClassName,
  label,
  labelStyle,
  labelClassName,
  tooltip,
  onClick,
}: IBtnCheckbox) => {
  const resolvedColor = color ?? "var(--primary)";

  const cbOnClick = React.useCallback(() => {
    if (disabled) return;
    onClick?.(!selected);
  }, [disabled, onClick, selected]);

  return (
    <BtnBase
      tooltip={Array.isArray(tooltip) ? tooltip.join("\n") : tooltip}
      disabled={disabled}
      onClick={cbOnClick}
      style={
        {
          ...style,
          color: resolvedColor,
          ["--btn-color" as string]: resolvedColor,
        } as React.CSSProperties
      }
      className={cn(
        "min-h-[40px] max-h-[40px]",
        "flex w-fit items-center justify-start rounded px-1.5 py-1.5 transition-colors border border-transparent",
        !disabled && "hover:border-[var(--btn-color)]",
        //disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <Checkbox
        color={resolvedColor}
        type={checkboxType}
        disabled={disabled}
        selected={selected}
        style={checkboxStyle}
        className={cn("mr-2", checkboxClassName)}
      />

      <Text style={labelStyle} className={labelClassName} children={label} />

      {selected === true && children}
    </BtnBase>
  );
};

export default BtnCheckbox;
