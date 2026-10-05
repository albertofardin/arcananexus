import ManagerData from "@/components/DataManager/ManagerData";
import BtnLink from "@/components/_core/BtnLink";
import { routes } from "@/app/routes";

type PageProps = {
  params: Promise<{
    campaignSlug: string;
    dataSlug: string;
  }>;
  searchParams?: Promise<{
    editing?: string;
  }>;
};

export default async function Page({ params, searchParams }: PageProps) {
  const { campaignSlug, dataSlug } = await params;
  const { editing } = (await searchParams) ?? {};

  return (
    <>
      <ManagerData
        campaignSlug={campaignSlug}
        dataSlug={dataSlug}
        editing={editing !== "0"}
        backLink={
          <BtnLink
            href={routes.campaignAdminDataTypes(campaignSlug)}
            icon="arrow_back"
            label="Torna ai Tipi di Dato"
          />
        }
      />
    </>
  );
}
