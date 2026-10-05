"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import ModalUpdateDowntime from "./ModalUpdateDowntime";
import Btn from "@/components/_core/Btn";
import { cn } from "@/lib/utils";

interface IBtnUpdatePointsDowntime {
  className?: string;
  characterId: number;
  isMaster: boolean;
  value: number;
  max: number;
}

const BtnUpdatePointsDowntime = ({
  className,
  characterId,
  isMaster,
  value,
  max,
}: IBtnUpdatePointsDowntime) => {
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
        icon="downtime"
        labelPosition
        label={max > 0 ? `${value}/${max}` : `${value}`}
        labelClassName="text-right"
        tooltip={!isMaster ? undefined : "Aggiungi (Only Master)"}
        onClick={!isMaster ? undefined : () => setOpen(true)}
      />
      <ModalUpdateDowntime
        open={open}
        onClose={() => setOpen(false)}
        characterId={characterId}
        value={value}
        onUpdated={() => router.refresh()}
      />
    </div>
  );
};

export default BtnUpdatePointsDowntime;
