import HeroPage from "@/components/HeroPage";
import BtnLink from "@/components/_core/BtnLink";
import MissiveList from "@/components/MissiveList";
import { routes } from "@/app/routes";

export default async function Page({
  params,
}: {
  params: Promise<{ campaignSlug: string }>;
}) {
  const { campaignSlug } = await params;

  return (
    <>
      <HeroPage
        title="Missive"
        action={
          <BtnLink
            variant="bold"
            icon="edit"
            label="Scrivi nuova missiva"
            href={routes.campaignMissiveNew(campaignSlug)}
          />
        }
      />

      <MissiveList campaignSlug={campaignSlug} />
    </>
  );
}
