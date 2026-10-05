"use client";

import * as React from "react";
import Icon from "../Icon";
import Text, { TextWeight } from "../Text";
import Tooltip from "../Tooltip";
import AvatarUser from "../../AvatarUser";
import BtnBase from "../BtnBase";
import Checkbox, { SelectType } from "../Checkbox";
import { cn } from "@/lib/utils";

export interface IListItem {
  id: string | number;
  avatar?: string;
  avatarText?: string;
  avatarIcon?: string;
  avatarSize?: number;
  avatarCircle?: boolean;
  avatarStyle?: React.CSSProperties;
  avatarClassName?: string;
  children?: React.ReactElement | React.ReactNode;
  onClick?: (id: string | number, event: React.MouseEvent) => void;
  copyToClipboard?: string;
  onCopyToClipboard?: (text: string) => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
  label: string;
  labelWeight?: TextWeight;
  labelStyle?: React.CSSProperties;
  labelClassName?: string;
  subLabel?: string;
  subLabelStyle?: React.CSSProperties;
  subLabelClassName?: string;
  icon?: string;
  iconStyle?: React.CSSProperties;
  iconClassName?: string;
  iconTooltip?: string;
  selected?: boolean;
  selectType?: SelectType;
  color?: string;
}
const ListItem = ({
  id,
  avatar,
  avatarText,
  avatarIcon,
  avatarSize = 25,
  avatarCircle,
  avatarStyle,
  avatarClassName,
  children,
  onClick = () => null,
  copyToClipboard,
  onCopyToClipboard,
  disabled,
  style,
  className,
  label,
  labelWeight = "regular",
  labelStyle,
  labelClassName,
  subLabel,
  subLabelStyle,
  subLabelClassName,
  icon,
  iconStyle,
  iconClassName,
  iconTooltip,
  selected,
  selectType = SelectType.NONE,
  color = "var(--primary)",
}: IListItem) => {
  const cbOnClick = React.useCallback(
    (event: React.MouseEvent) => {
      onClick?.(id, event);
    },
    [id, onClick]
  );

  return (
    <BtnBase
      color={color}
      style={style}
      className={cn(
        "group flex flex-row items-center min-h-[35px] px-3",
        subLabel && "py-[5px]",
        !!onClick && !selected && "hover:bg-accent",
        selected &&
          "bg-[color-mix(in_srgb,var(--primary)_20%,var(--button-bg))]",
        disabled && "cursor-default opacity-50 hover:bg-transparent",
        className
      )}
      onClick={!onClick ? undefined : cbOnClick}
      disabled={disabled}
      disabledRipple={disabled}
      copyToClipboard={copyToClipboard}
      onCopyToClipboard={onCopyToClipboard}
    >
      <Checkbox
        type={selectType}
        selected={selected}
        color={color}
        style={{ marginRight: 10 }}
      />
      {!avatar && !avatarText && !avatarIcon ? null : (
        <AvatarUser
          size={avatarSize}
          src={avatar}
          text={avatarText}
          icon={avatarIcon}
          circle={avatarCircle}
          className={cn("mr-3", avatarClassName)}
          style={avatarStyle}
        />
      )}
      {!icon ? null : (
        <Tooltip title={iconTooltip}>
          <Icon
            className={iconClassName}
            style={{ marginRight: 10, ...iconStyle }}
            children={icon}
          />
        </Tooltip>
      )}
      <div className="min-w-0 w-full">
        {!label ? null : (
          <Text
            ellipsis
            weight={selected ? "bolder" : labelWeight}
            style={labelStyle}
            className={labelClassName}
            children={label}
          />
        )}
        {!subLabel ? null : (
          <Text
            size={0}
            weight="lighter"
            style={subLabelStyle}
            className={subLabelClassName}
            children={subLabel}
          />
        )}
      </div>
      {children}
    </BtnBase>
  );
};
export default ListItem;
