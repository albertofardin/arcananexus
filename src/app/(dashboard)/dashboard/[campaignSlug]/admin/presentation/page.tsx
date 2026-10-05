import { headers } from "next/headers";
import { Role } from "@prisma/client";
import ManagerPresentation from "./_components/ManagerPresentation";
import BtnLink from "@/components/_core/BtnLink";
import { routes } from "@/app/routes";
import { prisma } from "@/lib/db";
import { checkCampaignAccess, getEffectiveUserId } from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

type PageProps = {
  params: Promise<{
    campaignSlug: string;
  }>;
};

export default async function Page({ params }: PageProps) {
  const { campaignSlug } = await params;
  const headersList = await headers();
  const userId = await getEffectiveUserId(headersList);

  const campaign = userId
    ? await getCampaignBySlug(prisma, campaignSlug, ARCANA_DOMINE_SLUG)
    : null;
  // Solo l'head_master può modificare la presentazione: master e supporter vi
  // accedono in sola lettura, coerente con la guardia head_master delle route
  // di scrittura (PUT campagna, upload/delete logo/copertina/galleria).
  const canEdit =
    userId && campaign
      ? await checkCampaignAccess(prisma, userId, campaign.id, Role.head_master)
      : false;

  return (
    <>
      <BtnLink
        href={routes.campaignAdmin(campaignSlug)}
        icon="arrow_back"
        label="Torna a Gestione Campagna"
      />
      <ManagerPresentation readOnly={!canEdit} />
    </>
  );
}
