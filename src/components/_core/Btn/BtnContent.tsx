import * as React from "react";
import Icon from "../Icon";
import Text, { TextSize } from "../Text";
import { cn } from "@/lib/utils";

type BtnVariant = "light" | "bold";

export const getBtnTextColor = (variant: BtnVariant = "light") =>
  variant === "light" ? "text-fg" : "text-white";

export const getBtnIconSize = (small?: boolean) => (small ? "sm" : "md");

export interface IBtnIcon {
  variant?: BtnVariant;
  small?: boolean;
  disabled?: boolean;
  hasLabel?: boolean;
  icon: string;
  iconClassName?: string;
  iconStyle?: React.CSSProperties;
}

export const BtnIcon = ({
  variant = "light",
  small,
  disabled,
  hasLabel,
  icon,
  iconClassName,
  iconStyle,
}: IBtnIcon) => (
  <Icon
    size={getBtnIconSize(small)}
    style={iconStyle}
    className={cn(
      getBtnTextColor(variant),
      hasLabel && "px-[2px]",
      disabled && "text-gray-400",
      iconClassName
    )}
    children={icon}
  />
);

export interface IBtnLabel {
  variant?: BtnVariant;
  disabled?: boolean;
  label: string | React.ReactElement;
  labelSize?: TextSize;
  labelRequired?: boolean;
  labelClassName?: string;
  labelStyle?: React.CSSProperties;
}

export const BtnLabel = ({
  variant = "light",
  disabled,
  label,
  labelSize = 1,
  labelRequired,
  labelClassName,
  labelStyle,
}: IBtnLabel) => (
  <Text
    ellipsis
    size={labelSize}
    style={labelStyle}
    className={cn(
      "mx-[5px] flex-1",
      getBtnTextColor(variant),
      disabled && "text-gray-400",
      labelClassName
    )}
  >
    <>
      {label}{" "}
      {!labelRequired ? null : <span className="ml-[2px] text-fail">*</span>}
    </>
  </Text>
);
