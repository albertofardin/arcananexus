import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { DataTypeRender } from "@prisma/client";
import EntryPageDetail from "./_components/EntryPageDetail";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  isUserCampaignAdmin,
  isUserCampaignHelper,
  isUserCampaignMaster,
} from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { getDataTypeByName } from "@/lib/repositories/dataType.repository";
import { listReferenceDataForDataType } from "@/lib/repositories/referenceData.repository";
import { getUserCharacterInCampaign } from "@/lib/repositories/character.repository";
import { listOwnedCharacterDataInCampaign } from "@/lib/repositories/characterData.repository";
import { listRequirementsForCampaign } from "@/lib/repositories/dataRequirement.repository";
import { buildVisibilityConditions, isEntryVisible } from "@/lib/visibility";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

type IPage = {
  params: Promise<{
    campaignSlug: string;
    dataSlug: string;
    entryId: string;
  }>;
};

export default async function Page({ params }: IPage) {
  const { campaignSlug, dataSlug, entryId } = await params;
  const headersList = await headers();

  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user) {
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

  const dataType = await getDataTypeByName(
    prisma,
    campaign.id,
    decodeURIComponent(dataSlug)
  );
  if (
    !dataType ||
    !dataType.sidebarShow ||
    dataType.renderAs !== DataTypeRender.pages
  ) {
    notFound();
  }

  const id = Number(entryId);
  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }

  const entries = await listReferenceDataForDataType(prisma, dataType.id);
  const entry = entries.find(candidate => candidate.id === id);
  if (!entry) {
    notFound();
  }

  const isStaff = await isUserCampaignHelper(
    prisma,
    session.user.id,
    campaign.id
  );
  const isMaster =
    (await isUserCampaignMaster(prisma, session.user.id, campaign.id)) ||
    (await isUserCampaignAdmin(prisma, session.user.id, campaign.id));
  const character = await getUserCharacterInCampaign(
    prisma,
    session.user.id,
    campaign.id
  );
  const ownedData = await listOwnedCharacterDataInCampaign(
    prisma,
    campaign.id,
    {
      userId: session.user.id,
      characterId: character?.id ?? null,
    }
  );

  const visible = isEntryVisible({ userId: session.user.id, isStaff }, entry, {
    campaign,
    character,
    ownedData,
    visibilityConditions: buildVisibilityConditions(
      await listRequirementsForCampaign(prisma, campaign.id)
    ),
  });
  if (!visible) {
    notFound();
  }

  return (
    <EntryPageDetail
      campaignSlug={campaign.slug}
      dataSlug={dataSlug}
      dataTypeId={dataType.id}
      dataTypeName={dataType.name}
      isMaster={isMaster}
      entry={{
        id: entry.id,
        name: entry.name,
        description: entry.description,
        visibility: entry.visibility,
      }}
    />
  );
}
