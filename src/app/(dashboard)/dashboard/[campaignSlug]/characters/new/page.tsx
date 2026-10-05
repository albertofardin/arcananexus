import { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { type DataCardinality, type DataType } from "@prisma/client";
import CharacterCreation, {
  type CatalogDataType,
  type CatalogRequirementEdge,
} from "@/components/CharacterCreation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isUserCampaignHelper } from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { listDataTypes } from "@/lib/repositories/dataType.repository";
import { listReferenceDataForCampaignWithVisibility } from "@/lib/repositories/referenceData.repository";
import { listRequirementsForCampaign } from "@/lib/repositories/dataRequirement.repository";
import { listUserCharacters } from "@/lib/repositories/character.repository";
import { getFeatureByFunctionName } from "@/lib/repositories/feature.repository";
import { FT_PROGRESS } from "@/lib/features";
import { progressFeatureSchema } from "@/lib/features/handlers/progress";
import { getXpBalance } from "@/lib/services/xp.service";
import { filterVisible } from "@/lib/visibility";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";
import { routes } from "@/app/routes";
import BtnLink from "@/components/_core/BtnLink";

type PageProps = {
  params: Promise<{
    campaignSlug: string;
  }>;
};

export const metadata: Metadata = {
  title: "Nuovo Personaggio | Arcana Domine",
  description: "Crea un nuovo personaggio",
};

export default async function Page({ params }: PageProps) {
  const { campaignSlug } = await params;
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

  const isStaff = await isUserCampaignHelper(
    prisma,
    session.user.id,
    campaign.id
  );

  const [dataTypes, referenceData, requirements, progressFeature] =
    await Promise.all([
      listDataTypes(prisma, campaign.id),
      listReferenceDataForCampaignWithVisibility(prisma, campaign.id),
      listRequirementsForCampaign(prisma, campaign.id),
      getFeatureByFunctionName(prisma, campaign.id, FT_PROGRESS),
    ]);

  // Recupero XP alla morte (T-019): se il sotto-toggle è attivo, propone in
  // creazione la lista dei propri PG già deceduti in questa campagna come
  // "donatori" — vedi `CharacterCreation.tsx`.
  const deathXpRecoveryConfig = progressFeature
    ? progressFeatureSchema.parse(progressFeature.featureData)
    : null;
  const deceasedCharacters = deathXpRecoveryConfig?.deathXpRecoveryEnabled
    ? await Promise.all(
        (
          await listUserCharacters(prisma, {
            userId: session.user.id,
            campaignSlug,
            deceasedOnly: true,
            take: 50,
          })
        ).map(async character => ({
          id: character.id,
          name: character.name,
          avatar: character.avatar,
          availableXp: (await getXpBalance(prisma, character.id)).available,
        }))
      )
    : [];

  const visibleDataTypes = dataTypes.filter(
    (dt): dt is DataType & { cardinality: DataCardinality } =>
      dt.cardinality !== null &&
      (isStaff ||
        (dt.assignability !== "masterOnly" && dt.visibility === "visible"))
  );
  const visibleReferenceData = filterVisible(
    referenceData,
    { userId: session.user.id, isStaff },
    { campaign, character: null, ownedData: [] }
  );

  const catalog: CatalogDataType[] = visibleDataTypes
    .map(dt => ({
      id: dt.id,
      name: dt.name,
      kind: dt.kind,
      cardinality: dt.cardinality,
      description: dt.description,
      icon: dt.icon,
      mandatory: dt.mandatory,
      masterOnly:
        dt.assignability === "masterOnly" || dt.visibility === "hidden",
      referenceData: visibleReferenceData
        .filter(rd => rd.dataTypeId === dt.id)
        .map(rd => ({
          id: rd.id,
          name: rd.name,
          description: rd.description,
          flags: rd.flags,
        })),
    }))
    .filter(dt => dt.referenceData.length > 0);

  const visibleReferenceDataIds = new Set(
    catalog.flatMap(dt => dt.referenceData.map(rd => rd.id))
  );
  // Solo `requires`/`blocks`: l'anteprima di creazione PG valuta requisiti e
  // blocchi contro la selezione corrente (T-022), non `visibleWith`/`grants`
  // (T-050, editor admin — la visibilità è già stata risolta server-side
  // sopra in `visibleReferenceData`); `grants` ha un canale a parte, sotto.
  const requirementGraph: CatalogRequirementEdge[] = requirements
    .filter(
      (r): r is typeof r & { type: "requires" | "blocks" } =>
        r.type === "requires" || r.type === "blocks"
    )
    .filter(
      r =>
        visibleReferenceDataIds.has(r.definitionId) &&
        visibleReferenceDataIds.has(r.requiredDefinitionId)
    )
    .map(r => ({
      definitionId: r.definitionId,
      requiredDefinitionId: r.requiredDefinitionId,
      type: r.type,
      groupId: r.groupId,
    }));

  // Archi `grants` (T-050): per l'avviso "Ottieni gratuitamente" e i talenti
  // bloccati in `CharacterCreation`. Solo la voce di origine deve essere
  // visibile al viewer; il bersaglio resta un id (il nome lo risolve il
  // client solo se a sua volta nel catalogo visibile).
  const grantEdges = requirements
    .filter(
      r => r.type === "grants" && visibleReferenceDataIds.has(r.definitionId)
    )
    .map(r => ({
      definitionId: r.definitionId,
      requiredDefinitionId: r.requiredDefinitionId,
    }));

  return (
    <>
      <BtnLink
        href={routes.campaignCharacters(campaignSlug)}
        icon="arrow_back"
        label="Torna ai personaggi"
      />
      <CharacterCreation
        campaignSlug={campaignSlug}
        isMaster={isStaff}
        catalog={catalog}
        requirements={requirementGraph}
        grants={grantEdges}
        deceasedCharacters={deceasedCharacters}
        deathXpRecoveryPercentage={
          deathXpRecoveryConfig?.deathXpRecoveryPercentage ?? 0
        }
      />
    </>
  );
}
