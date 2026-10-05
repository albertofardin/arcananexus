import Badge from "@/components/_core/Badge";
import {
  SUPPORT_TICKET_STATUS_CONFIG,
  type SupportTicketStatus,
} from "@/lib/support/status";

export interface IBadgeSupportTicketStatus {
  status: SupportTicketStatus;
  className?: string;
  style?: React.CSSProperties;
}

// Badge di stato di una segnalazione (T-0xx), stesso pattern di
// `BadgeCharacterStatus`: mero wrapper su `Badge` con label/icona/colore
// letti da `SUPPORT_TICKET_STATUS_CONFIG` (fonte di verità unica).
const BadgeSupportTicketStatus = ({
  status,
  className,
  style,
}: IBadgeSupportTicketStatus) => {
  const { icon, label, color } = SUPPORT_TICKET_STATUS_CONFIG[status];
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

export default BadgeSupportTicketStatus;
