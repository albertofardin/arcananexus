import Card from "../_core/Card";
import Text from "../_core/Text";
import Icon from "../_core/Icon";
import MembershipStatusBadge from "./MembershipStatusBadge";
import formatDate from "@/lib/utils/formatDate";
import formatCurrency from "@/lib/utils/formatCurrency";
import type { MembershipWithStatus } from "@/lib/validations/membership";

export interface IMembershipHistoryCard {
  membership: MembershipWithStatus;
}

/** Tessera scaduta: card compatta per lo storico */
const MembershipHistoryCard = ({ membership }: IMembershipHistoryCard) => (
  <Card className="flex-col items-stretch gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 min-w-[40px] items-center justify-center rounded bg-muted-bg">
        <Icon className="text-muted-fg" children="credit_card" />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <Text size={3} weight="bolder" children={`Anno ${membership.year}`} />
          <MembershipStatusBadge status={membership.status} />
        </div>
        <Text
          className="text-muted-fg"
          children={`${formatDate(membership.startDate)} — ${formatDate(membership.endDate)}`}
        />
      </div>
    </div>

    {membership.payment ? (
      <div className="flex items-center gap-2 sm:flex-col sm:items-end sm:gap-0">
        <Text
          size={3}
          weight="bolder"
          children={formatCurrency(membership.payment.value)}
        />
        <Text
          size={0}
          className="text-muted-fg"
          children={`Pagamento #${membership.payment.id}`}
        />
      </div>
    ) : (
      <Text className="text-fail" children="Pagamento non disponibile" />
    )}
  </Card>
);

export default MembershipHistoryCard;
