import type { XpReason } from "@prisma/client";

export const XP_REASON_LABELS: Record<XpReason, string> = {
  initialGrant: "Assegnazione iniziale",
  purchase: "Appreso",
  refund: "Rimborso",
  deathRecovery: "Recupero da morte",
  update: "Update",
  removal: "Rimosso",
};
