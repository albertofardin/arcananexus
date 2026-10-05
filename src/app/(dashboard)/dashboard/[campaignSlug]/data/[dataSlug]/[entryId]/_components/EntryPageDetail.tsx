"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import ModalEditDataPage from "@/components/DataManager/ModalEditDataPage";
import type { ContentEntry } from "@/components/DataManager/types";
import { routes } from "@/app/routes";
import HeroPage from "@/components/HeroPage";
import Card from "@/components/_core/Card";
import FieldRichText from "@/components/_core/FieldRichText";
import Btn from "@/components/_core/Btn";
import BtnLink from "@/components/_core/BtnLink";

interface IEntryPageDetail {
  campaignSlug: string;
  dataSlug: string;
  dataTypeId: number;
  dataTypeName: string;
  entry: ContentEntry;
  isMaster: boolean;
}

const EntryPageDetail = ({
  campaignSlug,
  dataSlug,
  dataTypeId,
  dataTypeName,
  entry,
  isMaster,
}: IEntryPageDetail) => {
  const router = useRouter();
  const [formOpen, setFormOpen] = React.useState(false);

  return (
    <>
      <BtnLink
        href={routes.campaignData(campaignSlug, dataSlug)}
        icon="arrow_back"
        label={`Torna a ${dataTypeName}`}
      />
      <HeroPage
        title={entry.name}
        action={
          isMaster ? (
            <Btn
              variant="bold"
              icon="edit"
              label="Modifica"
              onClick={() => setFormOpen(true)}
            />
          ) : undefined
        }
      />
      <Card className="min-h-fit flex flex-col items-stretch justify-start p-0">
        <FieldRichText
          className="border-transparent bg-transparent"
          value={entry.description ?? ""}
          readOnly
        />
        {isMaster && (
          <ModalEditDataPage
            open={formOpen}
            editing={entry}
            campaignSlug={campaignSlug}
            dataTypeId={dataTypeId}
            onClose={() => setFormOpen(false)}
            onSaved={() => router.refresh()}
          />
        )}
      </Card>
    </>
  );
};

export default EntryPageDetail;
