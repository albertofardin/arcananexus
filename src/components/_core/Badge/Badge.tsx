import Text from "../Text";
import Icon from "../Icon";
import BtnBase, { IKeyDown } from "../BtnBase";
import AvatarUser from "../../AvatarUser";
import { cn } from "@/lib/utils";

const gray = "#666666";

export interface IBadge {
  color?: string;
  label?: string;
  labelPosition?: boolean;
  labelClassName?: string;
  labelStyle?: React.CSSProperties;
  icon?: string;
  iconClassName?: string;
  iconStyle?: React.CSSProperties;
  avatarSrc?: string;
  avatarText?: string;
  avatarClassName?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (event: React.MouseEvent, keyDown: IKeyDown) => void;
  disabled?: boolean;
  background?: boolean;
  tooltip?: string | string[] | React.ReactElement;
}

const Badge = ({
  color = "var(--primary)",
  label,
  labelPosition,
  labelClassName,
  labelStyle,
  icon,
  iconClassName,
  iconStyle,
  avatarSrc,
  avatarText,
  avatarClassName,
  className,
  style,
  onClick,
  disabled,
  background = true,
  tooltip,
}: IBadge) => {
  const c = disabled ? gray : color;
  const hasAvatar = avatarText !== undefined || avatarSrc !== undefined;
  const hasVisual = !!icon || hasAvatar;
  const labelCmp = (
    <Text
      size={0}
      className={cn("text-inherit flex-1", labelClassName)}
      style={labelStyle}
      children={label}
    />
  );
  const visualCmp = hasAvatar ? (
    <AvatarUser
      size={12}
      src={avatarSrc}
      text={avatarText}
      className={cn("shrink-0", avatarClassName)}
      circle
    />
  ) : (
    <Icon
      size="sm"
      className={cn("text-inherit", iconClassName)}
      style={iconStyle}
      children={icon}
    />
  );

  return (
    <BtnBase
      tooltip={tooltip}
      color={color}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1 rounded-full backdrop-blur-sm",
        "shrink-0 min-h-[22px]",
        hasVisual && label
          ? !labelPosition
            ? "pl-2 pr-3"
            : "pr-2 pl-3"
          : "px-3",
        className
      )}
      style={{
        backgroundColor: background
          ? `color-mix(in srgb, ${c} 10%, #ffffff)`
          : undefined,
        color: `color-mix(in srgb, #000000 10%, ${c})`,
        ...style,
      }}
    >
      {label && labelPosition && labelCmp}
      {hasVisual && visualCmp}
      {label && !labelPosition && labelCmp}
    </BtnBase>
  );
};

export default Badge;
