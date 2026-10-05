"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import ModalEditDataPage from "./ModalEditDataPage";
import Btn from "@/components/_core/Btn";

interface IButtonCreateDataPage {
  campaignSlug: string;
  dataTypeId: number;
}

const ButtonCreateDataPage = ({
  campaignSlug,
  dataTypeId,
}: IButtonCreateDataPage) => {
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
      <ModalEditDataPage
        open={open}
        editing={null}
        campaignSlug={campaignSlug}
        dataTypeId={dataTypeId}
        onClose={() => setOpen(false)}
        onSaved={() => router.refresh()}
      />
    </div>
  );
};

export default ButtonCreateDataPage;
