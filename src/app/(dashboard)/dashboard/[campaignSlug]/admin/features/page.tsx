import FeaturesManager from "@/components/FeaturesManager/FeaturesManager";
import BtnLink from "@/components/_core/BtnLink";
import { routes } from "@/app/routes";

type PageProps = {
  params: Promise<{
    campaignSlug: string;
  }>;
};

export default async function Page({ params }: PageProps) {
  const { campaignSlug } = await params;

  return (
    <>
      <BtnLink
        href={routes.campaignAdmin(campaignSlug)}
        icon="arrow_back"
        label="Torna a Gestione Campagna"
      />
      <FeaturesManager />
    </>
  );
}
