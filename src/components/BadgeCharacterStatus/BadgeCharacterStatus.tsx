import { type CharacterStatus } from "./status";
import Badge from "@/components/_core/Badge";
import { CHARACTER_STATUS } from "@/lib/constants";

export interface IBadgeCharacterStatus {
  status: CharacterStatus;
  className?: string;
  style?: React.CSSProperties;
}

const BadgeCharacterStatus = ({
  status,
  className,
  style,
}: IBadgeCharacterStatus) => {
  const { icon, label, color } = CHARACTER_STATUS[status];
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

export default BadgeCharacterStatus;
