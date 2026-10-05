import * as React from "react";
import Link from "next/link";
import { IBtn } from "../Btn";
import { BtnIcon, BtnLabel } from "../Btn/BtnContent";
import { cn } from "@/lib/utils";

export interface IBtnLink extends Pick<
  IBtn,
  | "variant"
  | "color"
  | "className"
  | "style"
  | "icon"
  | "iconClassName"
  | "iconStyle"
  | "label"
  | "labelClassName"
  | "labelStyle"
  | "labelSize"
  | "labelPosition"
  | "small"
  | "selected"
> {
  href: string;
}

const BtnLink = ({
  href,
  variant = "light",
  color = "var(--button)",
  className,
  style,
  icon,
  iconClassName,
  iconStyle,
  label,
  labelSize = 1,
  labelPosition,
  labelClassName,
  labelStyle,
  small,
  selected,
}: IBtnLink) => {
  const sizeClass = small
    ? "min-h-[28px] max-h-[28px] min-w-[28px] py-[2px]"
    : "min-h-[40px] max-h-[40px] min-w-[40px] py-[4px]";

  const labelCmp = !label ? null : (
    <BtnLabel
      variant={variant}
      label={label}
      labelSize={labelSize}
      labelClassName={labelClassName}
      labelStyle={labelStyle}
    />
  );
  const iconCmp = !icon ? null : (
    <BtnIcon
      variant={variant}
      small={small}
      hasLabel={!!label}
      icon={icon}
      iconClassName={iconClassName}
      iconStyle={iconStyle}
    />
  );

  return (
    <Link
      href={href}
      style={
        {
          "--btn-color": color,
          ...style,
        } as React.CSSProperties
      }
      className={cn(
        "relative inline-flex w-fit cursor-pointer",
        "items-center justify-center",
        "overflow-hidden align-middle",
        "rounded transition-all duration-300",
        "bg-transparent",
        sizeClass,
        !!label ? "px-[7px]" : "px-0",
        variant === "bold" && "bg-[var(--btn-color)]",
        variant === "light" &&
          "border border-transparent hover:border-[var(--btn-color)] hover:bg-[color-mix(in_srgb,var(--btn-color)_15%,var(--button-bg))]",
        selected &&
          "border-[var(--btn-color)] bg-[color-mix(in_srgb,var(--btn-color)_15%,var(--button-bg))]",
        className
      )}
    >
      {labelPosition ? labelCmp : null}
      {iconCmp}
      {!labelPosition ? labelCmp : null}
    </Link>
  );
};

export default BtnLink;
