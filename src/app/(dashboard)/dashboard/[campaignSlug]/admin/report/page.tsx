import { notFound } from "next/navigation";
import { CampaignReport } from "@/components/CampaignReport";
import type { ReportCharacterRow } from "@/components/CampaignReport/types";
import BtnLink from "@/components/_core/BtnLink";
import { routes } from "@/app/routes";
import { prisma } from "@/lib/db";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { listCampaignCharactersForReport } from "@/lib/repositories/character.repository";
import { listTalentCatalogForCampaign } from "@/lib/repositories/referenceData.repository";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

type PageProps = {
  params: Promise<{
    campaignSlug: string;
  }>;
};

export default async function Page({ params }: PageProps) {
  const { campaignSlug } = await params;

  const campaign = await getCampaignBySlug(
    prisma,
    campaignSlug,
    ARCANA_DOMINE_SLUG
  );
  if (!campaign) {
    notFound();
  }

  const [characters, talentCatalog] = await Promise.all([
    listCampaignCharactersForReport(prisma, campaign.id),
    listTalentCatalogForCampaign(prisma, campaign.id),
  ]);

  // Le categorie "a torta" per il report sono i `DataType` origins/
  // assignable a cardinalità singola: il resto (generic, o cardinality
  // multi) non entra nell'aggregazione. I talenti (`kind: "talent"`,
  // cardinalità multi) sono invece raccolti a parte in `talents`, per la
  // card "quanti hanno X talento" — mischiarli in `data` romperebbe le
  // card a torta, che assumono al più un valore per categoria.
  const rows: ReportCharacterRow[] = characters.map(character => ({
    id: character.id,
    name: character.name,
    type: character.type,
    userName: character.user.name,
    avatar: character.avatar,
    lastUpdateDate: character.lastUpdateDate.toISOString(),
    approvalDate: character.approvalDate?.toISOString() ?? null,
    parkDate: character.parkDate?.toISOString() ?? null,
    deathDate: character.deathDate?.toISOString() ?? null,
    data: character.characterData
      .filter(
        entry =>
          (entry.dataType.kind === "origins" ||
            entry.dataType.kind === "assignable") &&
          entry.dataType.cardinality === "single"
      )
      .map(entry => ({
        dataTypeId: entry.dataType.id,
        dataTypeName: entry.dataType.name,
        referenceDataName: entry.referenceData.name,
      })),
    talents: character.characterData
      .filter(entry => entry.dataType.kind === "talent")
      .map(entry => entry.referenceData.name),
  }));

  return (
    <>
      <BtnLink
        href={routes.campaignAdmin(campaignSlug)}
        icon="arrow_back"
        label="Torna a Gestione Campagna"
      />
      <CampaignReport
        campaignSlug={campaignSlug}
        rows={rows}
        talentCatalog={talentCatalog}
      />
    </>
  );
}
