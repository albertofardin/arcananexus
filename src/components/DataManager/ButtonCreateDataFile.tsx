"use client";

import * as React from "react";
import ModalEditDataFile from "./ModalEditDataFile";
import Btn from "@/components/_core/Btn";

interface IButtonCreateDataFile {
  campaignSlug: string;
  dataTypeId: number;
}

const ButtonCreateDataFile = ({
  campaignSlug,
  dataTypeId,
}: IButtonCreateDataFile) => {
  const [open, setOpen] = React.useState(false);

  return (
    <div>
      <Btn
        variant="bold"
        icon="add"
        label="Aggiungi"
        onClick={() => setOpen(true)}
      />
      <ModalEditDataFile
        open={open}
        editing={null}
        campaignSlug={campaignSlug}
        dataTypeId={dataTypeId}
        onClose={() => setOpen(false)}
      />
    </div>
  );
};

export default ButtonCreateDataFile;
