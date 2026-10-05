import { Role } from "@prisma/client";
import Badge from "@/components/_core/Badge";
import { ROLE_COLORS } from "@/lib/constants";

export type BadgeRoleType =
  "onlyStaff" | "onlyMaster" | "onlyHeadmaster" | "onlyDirettivo";

// Colori letti da `ROLE_COLORS` (`lib/constants.ts`, unica fonte di
// verità condivisa anche con `roleDefinitions.ts`): `BadgeRoleType` non è
// altro che `Role` nel dominio "a chi è riservato questo contenuto"
// (`onlyStaff`→`supporter`, `onlyMaster`→`master`, `onlyHeadmaster`→
// `head_master`), quindi condivide la stessa tinta invece di duplicarla.
const BADGE_ROLE_CONFIG: Record<
  BadgeRoleType,
  { icon: string; label: string; color: string }
> = {
  onlyStaff: {
    icon: "visibility",
    label: "Solo Staff",
    color: ROLE_COLORS[Role.supporter],
  },
  onlyMaster: {
    icon: "master",
    label: "Solo Master",
    color: ROLE_COLORS[Role.master],
  },
  onlyHeadmaster: {
    icon: "headmaster",
    label: "Riservato all'Head Master",
    color: ROLE_COLORS[Role.head_master],
  },
  onlyDirettivo: {
    icon: "account_balance",
    label: "Solo Direttivo",
    color: ROLE_COLORS[Role.head_master],
  },
};

export interface IBadgeRole {
  type: BadgeRoleType;
  className?: string;
  style?: React.CSSProperties;
}

const BadgeRole = ({ type, className, style }: IBadgeRole) => {
  const { icon, label, color } = BADGE_ROLE_CONFIG[type];
  return (
    <Badge
      label={label}
      icon={icon}
      color={color}
      className={className}
      style={style}
    />
  );
};

export default BadgeRole;
