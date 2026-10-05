import { headers } from "next/headers";
import { Role } from "@prisma/client";
import { ManagerRolesCampaign } from "@/components/RoleManager";
import BtnLink from "@/components/_core/BtnLink";
import { routes } from "@/app/routes";
import { prisma } from "@/lib/db";
import { getEffectiveUserId, getUserCampaignRole } from "@/lib/authorization";
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
  const role =
    userId && campaign
      ? await getUserCampaignRole(prisma, userId, campaign.id)
      : null;

  return (
    <>
      <BtnLink
        href={routes.campaignAdmin(campaignSlug)}
        icon="arrow_back"
        label="Torna a Gestione Campagna"
      />
      <ManagerRolesCampaign
        editMode={role === Role.head_master ? "head_master" : "readonly"}
      />
    </>
  );
}
