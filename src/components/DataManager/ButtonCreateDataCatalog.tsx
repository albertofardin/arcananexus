"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import ModalEditDataCatalog from "./ModalEditDataCatalog";
import type { EntryFormAdvancedConfig } from "./useEntryForm";
import Btn from "@/components/_core/Btn";

interface IButtonCreateDataCatalog {
  campaignSlug: string;
  dataTypeId: number;
  advanced?: EntryFormAdvancedConfig;
}

const ButtonCreateDataCatalog = ({
  campaignSlug,
  dataTypeId,
  advanced,
}: IButtonCreateDataCatalog) => {
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
      <ModalEditDataCatalog
        open={open}
        editing={null}
        campaignSlug={campaignSlug}
        dataTypeId={dataTypeId}
        onClose={() => setOpen(false)}
        onSaved={() => router.refresh()}
        advanced={advanced}
      />
    </div>
  );
};

export default ButtonCreateDataCatalog;
