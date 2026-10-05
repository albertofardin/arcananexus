import { notFound } from "next/navigation";
import CampaignThemeSync from "./_components/CampaignThemeSync";
import { prisma } from "@/lib/db";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

export default async function CampaignLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ campaignSlug: string }>;
}) {
  const { campaignSlug } = await params;

  const campaign = await getCampaignBySlug(
    prisma,
    campaignSlug,
    ARCANA_DOMINE_SLUG
  );
  if (!campaign) {
    notFound();
  }

  return (
    <>
      <CampaignThemeSync color={campaign.color} texture={campaign.texture} />
      {children}
    </>
  );
}
