"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import ModalEditDataTalent from "./ModalEditDataTalent";
import Btn from "@/components/_core/Btn";

interface IButtonCreateDataTalent {
  campaignSlug: string;
  dataTypeId: number;
  missiveActive?: boolean;
  downtimeActive?: boolean;
  categories?: string[];
}

const ButtonCreateDataTalent = ({
  campaignSlug,
  dataTypeId,
  missiveActive,
  downtimeActive,
  categories,
}: IButtonCreateDataTalent) => {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  return (
    <div>
      <Btn
        variant="bold"
        icon="add"
        label="Aggiungi"
        onClick={() => setOpen(true)}
      />
      <ModalEditDataTalent
        open={open}
        editing={null}
        campaignSlug={campaignSlug}
        dataTypeId={dataTypeId}
        onClose={() => setOpen(false)}
        onSaved={() => router.refresh()}
        missiveActive={missiveActive}
        downtimeActive={downtimeActive}
        categories={categories}
      />
    </div>
  );
};

export default ButtonCreateDataTalent;
