"use client";

import * as React from "react";
import Text from "../Text";
import Icon from "../Icon";
import FieldInputIcon from "./FieldInputIcon";
import { cn } from "@/lib/utils";

export interface IField {
  className?: string;
  style?: React.CSSProperties;
  label?: React.ReactNode;
  labelIcon?: string;
  labelMandatory?: boolean;
  icon?: string;
  iconClassName?: string;
  iconStyle?: React.CSSProperties;
  iconOnClick?: () => void;
  readOnly?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  inFocus?: boolean;
}

const Field = React.forwardRef<HTMLDivElement, IField>(
  (
    {
      className,
      style,
      label,
      labelIcon,
      labelMandatory,
      icon,
      iconClassName,
      iconStyle,
      iconOnClick,
      readOnly,
      disabled,
      children,
      onClick,
      inFocus,
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        style={style}
        className={cn(
          "relative block flex flex-row items-center gap-0.5 rounded bg-input transition-all",
          "border border-border focus-within:border-primary",
          "min-h-[40px] shrink-0 items-center",
          !disabled && !readOnly && "hover:border-primary",
          label && "mt-5",
          disabled && "cursor-not-allowed",
          readOnly && "border-transparent bg-transparent",
          inFocus && "border-primary",
          className
        )}
        onClick={onClick}
      >
        <div className="absolute -top-5 left-1 flex flex-row gap-1 items-center">
          {labelIcon && (
            <Icon size="sm" className="text-muted-fg" children={labelIcon} />
          )}
          {label && (
            <Text size={0} className="text-muted-fg">
              {label}
              {labelMandatory ? (
                <span className="text-fail ml-0.5">*</span>
              ) : null}
            </Text>
          )}
        </div>
        <FieldInputIcon
          icon={icon}
          className={iconClassName}
          style={iconStyle}
          onClick={iconOnClick}
        />
        {children}
      </div>
    );
  }
);

Field.displayName = "Field";

export default Field;
