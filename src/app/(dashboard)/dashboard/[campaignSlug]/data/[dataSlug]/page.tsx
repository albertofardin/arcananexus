import ManagerData from "@/components/DataManager/ManagerData";

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
    <ManagerData
      campaignSlug={campaignSlug}
      dataSlug={dataSlug}
      editing={editing === "1"}
    />
  );
}
