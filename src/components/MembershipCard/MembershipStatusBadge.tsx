import Badge from "../_core/Badge";

export interface IMembershipStatusBadge {
  status: "active" | "expired";
}

const MembershipStatusBadge = ({ status }: IMembershipStatusBadge) => {
  const active = status === "active";
  return (
    <Badge
      icon={active ? "check_circle" : "history"}
      label={active ? "Attiva" : "Scaduta"}
      disabled={!active}
    />
  );
};

export default MembershipStatusBadge;
