"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import ModalUpdateMissive from "./ModalUpdateMissive";
import Btn from "@/components/_core/Btn";
import { cn } from "@/lib/utils";

interface IBtnUpdatePointsMissive {
  className?: string;
  characterId: number;
  isMaster: boolean;
  value: number;
  max: number;
}

const BtnUpdatePointsMissive = ({
  className,
  characterId,
  isMaster,
  value,
  max,
}: IBtnUpdatePointsMissive) => {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  return (
    <div>
      <Btn
        small
        className={cn(
          "min-w-[100px] pr-[10px]",
          !isMaster ? "bg-transparent" : "bg-card",
          className
        )}
        icon="mail"
        labelPosition
        label={max > 0 ? `${value}/${max}` : `${value}`}
        labelClassName="text-right"
        tooltip={!isMaster ? undefined : "Aggiungi (Only Master)"}
        onClick={!isMaster ? undefined : () => setOpen(true)}
      />
      <ModalUpdateMissive
        open={open}
        onClose={() => setOpen(false)}
        characterId={characterId}
        count={value}
        onUpdated={() => router.refresh()}
      />
    </div>
  );
};

export default BtnUpdatePointsMissive;
