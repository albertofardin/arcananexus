import HeroPage from "@/components/HeroPage";
import BtnLink from "@/components/_core/BtnLink";
import DowntimeList from "@/components/DowntimeList";
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
        title="Downtime"
        action={
          <BtnLink
            variant="bold"
            icon="edit"
            label="Crea downtime"
            href={routes.campaignDowntimeNew(campaignSlug)}
          />
        }
      />

      <DowntimeList campaignSlug={campaignSlug} />
    </>
  );
}
