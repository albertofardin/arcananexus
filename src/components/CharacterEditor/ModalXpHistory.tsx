"use client";

import type { CharacterXpBalance } from "./CharacterEditor";
import Divider from "@/components/_core/Divider";
import Modal from "@/components/_core/Modal";
import Text from "@/components/_core/Text";
import formatDate from "@/lib/utils/formatDate";
import { XP_REASON_LABELS } from "@/lib/labels";
import type { XpTransactionWithReferenceData } from "@/lib/repositories/xpTransaction.repository";

function getAmountColor(transaction: XpTransactionWithReferenceData): string {
  const a = transaction.amount;
  if (a > 0) return "var(--succ)";
  if (a < 0) return "var(--fail)";
  return "var(--info)";
}
function getReasonDescription(
  transaction: XpTransactionWithReferenceData
): string {
  return [
    XP_REASON_LABELS[transaction.reason],
    transaction.referenceData?.name,
    transaction.note,
  ]
    .filter(a => !!a)
    .join(" — ");
}

const ModalXpHistory = ({
  open,
  onClose,
  xpBalance,
  xpTransactions,
}: {
  open: boolean;
  onClose: () => void;
  xpBalance: CharacterXpBalance;
  xpTransactions: XpTransactionWithReferenceData[];
}) => {
  return (
    <Modal
      open={open}
      onClose={onClose}
      titleClose
      title="Cronologia avanzamento"
      className="sm:min-w-[480px]"
      content={
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col items-center gap-0.5 rounded border border-border py-2">
              <Text size={0} className="text-muted-fg" children="Accumulati" />
              <Text
                size={4}
                weight="bolder"
                children={`${xpBalance.earned} XP`}
              />
            </div>
            <div className="flex flex-col items-center gap-0.5 rounded border border-border py-2">
              <Text size={0} className="text-muted-fg" children="Disponibili" />
              <Text
                size={4}
                weight="bolder"
                children={`${xpBalance.available} XP`}
              />
            </div>
          </div>

          <Divider />

          {xpTransactions.length === 0 ? (
            <Text
              className="text-muted-fg text-center py-2"
              children="Nessuna transazione registrata"
            />
          ) : (
            <ul className="flex flex-col w-full overflow-scroll">
              {xpTransactions.map(transaction => (
                <li
                  key={transaction.id}
                  className="flex items-center gap-3 p-2 rounded hover:bg-accent"
                >
                  <Text
                    size={0}
                    className="text-muted-fg"
                    children={formatDate(transaction.createdAt)}
                  />
                  <Text
                    weight="bolder"
                    style={{ color: getAmountColor(transaction) }}
                    className="min-w-[50px] text-right"
                    children={`${transaction.amount > 0 ? "+" : ""}${transaction.amount} XP`}
                  />
                  <Text
                    className="flex-1"
                    ellipsis
                    children={getReasonDescription(transaction)}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      }
    />
  );
};

export default ModalXpHistory;
