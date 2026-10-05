"use client";
import * as React from "react";
import Icon from "../Icon";
import BtnBase from "../BtnBase";
import PopoverList, { IPopoverListItem } from "../PopoverList";
import { PopoverOrigin } from "../Popover";
import Avatar from "../Avatar";
import { TextSize } from "../Text";
import {
  BtnIcon,
  BtnLabel,
  getBtnIconSize,
  getBtnTextColor,
} from "./BtnContent";
import emptyFn from "@/lib/utils/emptyFn";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export interface IBtn {
  variant?: "light" | "bold";
  color?: string;
  cmpRef?;
  className?: string;
  style?: React.CSSProperties;
  icon?: string;
  iconClassName?: string;
  iconStyle?: React.CSSProperties;
  label?: string | React.ReactElement;
  labelClassName?: string;
  labelStyle?: React.CSSProperties;
  labelSize?: TextSize;
  labelPosition?: boolean;
  labelRequired?: boolean;
  copyToClipboard?: string;
  onCopyToClipboard?: (text: string) => void;
  avatar?: string;
  avatarText?: string;
  avatarIcon?: string;
  avatarClassName?: string;
  avatarStyle?: React.CSSProperties;
  disabled?: boolean;
  onMouseEnter?: (event: React.MouseEvent) => void;
  onMouseLeave?: (event: React.MouseEvent) => void;
  onClick?: (event: React.MouseEvent) => void;
  selected?: boolean;
  tooltip?: string | string[];
  tooltipPlace?: "top" | "bottom" | "left" | "right";
  tooltipOpen?: boolean;
  menu?: {
    icon?: boolean;
    iconClassName?: string;
    iconStyle?: React.CSSProperties;
    originTransf?: PopoverOrigin;
    originAnchor?: PopoverOrigin;
    onClose?: () => void;
    items: IPopoverListItem[];
    title?: string;
  };
  small?: boolean;
  badge?: boolean;
  badgeColor?: string;
  children?: React.ReactElement | React.ReactNode;
}

const getRippleColor = (
  color: string | undefined,
  variant: "light" | "bold"
) => {
  switch (variant) {
    case "light":
      return color;
    default:
      return "var(--bg)";
  }
};
enum ACTION {
  SET_MENU_OPEN = "SET_MENU_OPEN",
  SET_ON_CLOSE = "SET_ON_CLOSE",
}
const reducer = (state, action) => {
  switch (action.type) {
    case ACTION.SET_MENU_OPEN:
      return { ...state, menuOpen: action.menuOpen };
    case ACTION.SET_ON_CLOSE:
      return { ...state, menuOpen: false };
    default:
      throw new Error();
  }
};

const Btn = ({
  variant = "light",
  cmpRef,
  className,
  style,
  tooltip,
  tooltipPlace,
  tooltipOpen,
  disabled,
  onClick,
  icon,
  iconClassName,
  iconStyle,
  label,
  labelSize = 1,
  labelPosition,
  labelRequired,
  labelClassName,
  labelStyle,
  color = "var(--button)",
  selected,
  avatar,
  avatarText,
  avatarIcon,
  avatarClassName,
  avatarStyle,
  copyToClipboard,
  onCopyToClipboard,
  menu,
  onMouseEnter,
  onMouseLeave,
  small,
  badge,
  badgeColor = "var(--fail)",
  children,
}: IBtn) => {
  const [buttonRef, setButtonRef] = React.useState(cmpRef);
  const [state, dispatch] = React.useReducer(reducer, {
    menuOpen: false,
  });
  const { menuOpen } = state;
  const isMobile = useIsMobile();
  const cbOnMouseEnter = React.useCallback(
    event => {
      if (isMobile) return;
      onMouseEnter?.(event);
    },
    [onMouseEnter, isMobile]
  );
  const cbOnMouseLeave = React.useCallback(
    event => {
      if (isMobile) return;
      onMouseLeave?.(event);
    },
    [onMouseLeave, isMobile]
  );
  const cbOnClose = React.useCallback(() => {
    dispatch({ type: ACTION.SET_ON_CLOSE });
    setTimeout(menu?.onClose || emptyFn, 200);
  }, [menu]);
  const cbOnClick = React.useCallback(
    event => {
      event.preventDefault();
      event.stopPropagation();
      if (menu) {
        dispatch({ type: ACTION.SET_MENU_OPEN, menuOpen: true });
      }
      onClick?.(event);
    },
    [menu, onClick]
  );
  const active =
    !disabled &&
    (!!onClick || !!copyToClipboard || !!menu || menuOpen || selected);
  const sizeClass = small
    ? "min-h-[28px] max-h-[28px] min-w-[28px] py-[2px]"
    : "min-h-[40px] max-h-[40px] min-w-[40px] py-[4px]";
  const iconSize = getBtnIconSize(small);
  const textColor = getBtnTextColor(variant);
  const labelCmp = !label ? null : (
    <BtnLabel
      variant={variant}
      disabled={disabled}
      label={label}
      labelSize={labelSize}
      labelRequired={labelRequired}
      labelClassName={labelClassName}
      labelStyle={labelStyle}
    />
  );
  const iconCmp = !icon ? null : (
    <BtnIcon
      variant={variant}
      small={small}
      disabled={disabled}
      hasLabel={!!label}
      icon={icon}
      iconClassName={iconClassName}
      iconStyle={iconStyle}
    />
  );
  const avatarCmp = (
    <Avatar
      size={22}
      src={avatar}
      text={avatarText}
      icon={avatarIcon}
      className={avatarClassName}
      style={avatarStyle}
      circle
    />
  );

  return (
    <>
      <BtnBase
        ref={setButtonRef}
        color={getRippleColor(color, variant)}
        tooltip={tooltip}
        tooltipPlace={tooltipPlace}
        tooltipOpen={tooltipOpen}
        copyToClipboard={copyToClipboard}
        onCopyToClipboard={onCopyToClipboard}
        onClick={
          disabled || (!copyToClipboard && !menu && !onClick)
            ? undefined
            : cbOnClick
        }
        onMouseEnter={cbOnMouseEnter}
        onMouseLeave={cbOnMouseLeave}
        style={
          {
            "--btn-color": color,
            ...style,
          } as React.CSSProperties
        }
        className={cn(
          "relative inline-flex",
          "items-center justify-center",
          "overflow-hidden align-middle",
          "rounded transition-all duration-300",
          "bg-transparent",
          "data-[selected=true]:bg-[var(--hover-bg)]",
          "border border-transparent",
          sizeClass,
          !!label ? "px-[7px]" : "px-0",
          variant === "bold" && "bg-[var(--btn-color)]",
          active ? `cursor-pointer` : "cursor-default bg-gray-200",
          variant === "light" && active && "hover:border-[var(--btn-color)]",
          variant === "light" &&
            (selected || menuOpen) &&
            "border-[var(--btn-color)] bg-[color-mix(in_srgb,var(--btn-color)_15%,var(--button-bg))]",
          className
        )}
      >
        {!!label && labelPosition ? labelCmp : null}
        {!icon ? null : iconCmp}
        {!avatar && !avatarText && !avatarIcon ? null : avatarCmp}
        {!!label && !labelPosition ? labelCmp : null}
        {!menu || !menu.icon ? null : (
          <Icon
            size={iconSize}
            style={menu.iconStyle}
            className={cn(textColor, menu.iconClassName)}
            children="arrow_drop_down"
          />
        )}
        {!badge ? null : (
          <div
            role="presentation"
            style={{ backgroundColor: badgeColor }}
            className={cn(
              "absolute right-[1px] top-[1px]",
              "rounded-full border-2 border-bg",
              "p-[5px]"
            )}
          />
        )}
        {children}
      </BtnBase>
      {!menu ? null : (
        <PopoverList
          open={menuOpen}
          anchorEl={buttonRef}
          actions={menu.items}
          originAnchor={menu.originAnchor}
          originTransf={menu.originTransf}
          onClose={cbOnClose}
          title={menu.title}
          style={{ minWidth: buttonRef?.offsetWidth }}
        />
      )}
    </>
  );
};
export default Btn;
