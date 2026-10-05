import Text from "../_core/Text";
import Icon from "../_core/Icon";
import MembershipStatusBadge from "./MembershipStatusBadge";
import formatDate from "@/lib/utils/formatDate";
import type { MembershipWithStatus } from "@/lib/validations/membership";

export interface IMembershipCard {
  membership: MembershipWithStatus;
  holderName?: string;
}

/**
 * Tessera attiva: resa come una carta fisica, con il gradiente
 * del tema corrente (stesso stile dell'hero della pagina Profilo).
 */
const MembershipCard = ({ membership, holderName }: IMembershipCard) => (
  <div
    className="relative mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-border shadow-lg"
    style={{
      background:
        "linear-gradient(135deg, var(--panel) 0%, color-mix(in srgb, var(--panel) 65%, var(--primary)) 100%)",
      aspectRatio: "1.586", // proporzioni carta di credito ISO/IEC 7810
      minHeight: 200,
    }}
  >
    {/* anelli decorativi */}
    <div
      className="absolute -right-12 -top-12 h-44 w-44 rounded-full opacity-10"
      style={{ background: "var(--primary)" }}
    />
    <div
      className="absolute -bottom-10 right-16 h-28 w-28 rounded-full opacity-10"
      style={{ background: "var(--primary)" }}
    />

    <div className="relative flex h-full flex-col justify-between p-5 sm:p-6">
      {/* header: org + stato */}
      <div className="flex items-start justify-between gap-2">
        <Text
          weight="bolder"
          className="uppercase tracking-[0.2em]"
          style={{ color: "rgba(255,255,255,0.85)" }}
          children="Arcana Domine"
        />
        <MembershipStatusBadge status={membership.status} />
      </div>

      {/* chip + numero */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-12 items-center justify-center rounded"
          style={{ background: "rgba(255,255,255,0.2)" }}
        >
          <Icon style={{ color: "#fff" }} children="credit_card" />
        </div>
        <Text
          size={3}
          weight="bolder"
          className="tracking-[0.15em]"
          style={{ color: "#fff" }}
          children={`N. ${String(membership.id).padStart(6, "0")}`}
        />
      </div>

      {/* footer: titolare + validità */}
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          {holderName && (
            <Text
              size={3}
              weight="bolder"
              ellipsis
              className="uppercase"
              style={{ color: "#fff" }}
              children={holderName}
            />
          )}
          <Text
            size={0}
            style={{ color: "rgba(255,255,255,0.7)" }}
            children={`Valida fino al ${formatDate(membership.endDate)}`}
          />
        </div>
        <Text
          size={6}
          weight="bolder"
          style={{ color: "rgba(255,255,255,0.9)" }}
          children={String(membership.year)}
        />
      </div>
    </div>
  </div>
);

export default MembershipCard;
