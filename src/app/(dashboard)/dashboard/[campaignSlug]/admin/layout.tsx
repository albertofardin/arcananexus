import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { checkCampaignAccess, getEffectiveUserId } from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import EmptyCard from "@/components/Feedback/EmptyCard";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

export default async function CampaignAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ campaignSlug: string }>;
}) {
  const { campaignSlug } = await params;
  // La sezione ammette qualunque membro dello staff della campagna
  // Le route API restano comunque il confine di sicurezza reale.
  const requiredRole = Role.supporter;
  const headersList = await headers();

  const userId = await getEffectiveUserId(headersList);
  if (!userId) {
    notFound();
  }

  const campaign = await getCampaignBySlug(
    prisma,
    campaignSlug,
    ARCANA_DOMINE_SLUG
  );
  if (!campaign) {
    notFound();
  }

  const hasRoleAccess = await checkCampaignAccess(
    prisma,
    userId,
    campaign.id,
    requiredRole
  );
  if (!hasRoleAccess) {
    return (
      <EmptyCard
        icon="lock"
        title="Permessi insufficienti"
        message="Questa sezione è riservata allo staff della campagna"
      />
    );
  }

  return children;
}
