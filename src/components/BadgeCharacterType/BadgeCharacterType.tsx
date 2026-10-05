import { CharacterType } from "@prisma/client";
import Badge from "@/components/_core/Badge";
import { CHARACTER_TYPE } from "@/lib/constants";

export interface IBadgeCharacterType {
  type: CharacterType;
  className?: string;
  style?: React.CSSProperties;
}

const BadgeCharacterType = ({
  type,
  className,
  style,
}: IBadgeCharacterType) => {
  const { icon, label, color } = CHARACTER_TYPE[type];
  return (
    <Badge
      icon={icon}
      label={label}
      color={color}
      className={className}
      style={style}
    />
  );
};

export default BadgeCharacterType;
