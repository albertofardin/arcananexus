"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import ModalUpdateXp from "./ModalUpdateXp";
import Btn from "@/components/_core/Btn";
import { cn } from "@/lib/utils";

interface IBtnUpdatePointsXp {
  className?: string;
  characterId?: number;
  value: number;
  isMaster: boolean;
}

const BtnUpdatePointsXp = ({
  className,
  characterId,
  value,
  isMaster,
}: IBtnUpdatePointsXp) => {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const canOpen = isMaster && !!characterId;
  const negative = value < 0;

  return (
    <div>
      <Btn
        small
        color={negative ? "var(--fail)" : "var(--succ)"}
        className={cn(
          negative ? undefined : isMaster ? "bg-card" : "bg-transparent",
          "min-w-[100px] pr-[10px]",
          className
        )}
        icon="stars"
        iconClassName={negative ? "text-fail" : ""}
        label={`${value} XP`}
        labelPosition
        labelClassName={cn("text-right", negative ? "text-fail" : "")}
        tooltip={
          negative
            ? "XP insufficienti: rimuovi qualche talento dalla bozza per poter salvare"
            : isMaster && "Aggiungi (Only Master)"
        }
        onClick={canOpen ? () => setOpen(true) : undefined}
      />
      {characterId && (
        <ModalUpdateXp
          open={open}
          onClose={() => setOpen(false)}
          characterId={characterId}
          onUpdated={() => router.refresh()}
        />
      )}
    </div>
  );
};

export default BtnUpdatePointsXp;
