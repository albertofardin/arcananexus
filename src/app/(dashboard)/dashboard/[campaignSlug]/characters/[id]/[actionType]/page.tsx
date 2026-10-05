import { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { DataTypeKind } from "@prisma/client";
import DowntimeWriter from "@/components/DowntimeWriter";
import MissiveWriter, {
  type MissiveReceiver,
} from "@/components/MissiveWriter";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import {
  getCharacterInCampaign,
  listCampaignCharacters,
} from "@/lib/repositories/character.repository";
import { listCharacterDataForCharacterWithDetails } from "@/lib/repositories/characterData.repository";
import { getFeatureByFunctionName } from "@/lib/repositories/feature.repository";
import { FT_DOWNTIME, FT_MISSIVE } from "@/lib/features";
import { missiveFeatureSchema } from "@/lib/features/handlers/missive";
import { downtimeFeatureSchema } from "@/lib/features/handlers/downtime";
import { getCharacterStatus } from "@/components/BadgeCharacterStatus";
import HeroPage from "@/components/HeroPage";
import { EmptyCard } from "@/components/Feedback";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";
import { routes } from "@/app/routes";
import BtnLink from "@/components/_core/BtnLink";
import Text from "@/components/_core/Text";
import {
  isUserCampaignMaster,
  isUserCampaignHelper,
} from "@/lib/authorization";
import AvatarUser from "@/components/AvatarUser";
import Card from "@/components/_core/Card";
import Badge from "@/components/_core/Badge";
import { sumPointBonuses } from "@/lib/features/pointBonus";

type PageProps = {
  params: Promise<{
    campaignSlug: string;
    id: string;
    actionType: string;
  }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { actionType } = await params;
  return { title: `${decodeURIComponent(actionType)} | Arcana Domine` };
}

// Pagina giocatore per dichiarare un'azione: `actionType` è sempre
// `FT_MISSIVE` o `FT_DOWNTIME` (contenitore, mai eseguibile come azione —
// vedi `handlers/downtime.ts`), gli unici due `functionName` verso cui
// l'app genera link (`ActionRow`/`ActionRowMissive` in `CharacterEditor.tsx`).
// La categoria downtime si sceglie dentro `DowntimeWriter` (`FieldSelect`),
// non più via un link dedicato per categoria — ogni altro `functionName`
// (una categoria specifica, `deathXpRecovery`, `talents`, ...) risulta
// 404.
export default async function Page({ params }: PageProps) {
  const { campaignSlug, id, actionType } = await params;
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

  const character = await getCharacterInCampaign(
    prisma,
    Number(id),
    campaign.id
  );
  if (!character) {
    notFound();
  }

  const functionName = decodeURIComponent(actionType);
  const isMissive = functionName === FT_MISSIVE;
  const isDowntime = functionName === FT_DOWNTIME;

  if (!isMissive && !isDowntime) {
    notFound();
  }

  let featureName: string;
  let downtimeCategories: string[] = [];
  let downtimeTalents: {
    id: number;
    name: string;
    description: string | null;
  }[] = [];
  let pngCountsAsDowntime = false;
  let maxMissivePerEvent = 0;
  let canAnswer = false;
  let missiveReceivers: MissiveReceiver[] = [];
  const isMaster = await isUserCampaignMaster(
    prisma,
    session.user.id,
    campaign.id
  );
  // Soglia "staff della campagna" (T-0xx, sospensione lato PG): più ampia di
  // `isMaster` sopra (che copre solo master/head_master, usato per i badge
  // "nessun limite") — include anche il supporter/helper, coerente con
  // `Feature.paused` (bloccati SOLO i PG, mai lo staff a qualunque livello).
  const isStaff = await isUserCampaignHelper(
    prisma,
    session.user.id,
    campaign.id
  );
  // `true` quando la feature è stata messa in pausa dallo staff e chi
  // guarda questa pagina è un PG (mai per lo staff, sempre operativo): monta
  // un `EmptyCard` informativo invece del writer, vedi il render sotto.
  let isPaused = false;

  if (isMissive) {
    const feature = await getFeatureByFunctionName(
      prisma,
      campaign.id,
      functionName
    );
    if (!feature) {
      notFound();
    }
    featureName = feature.featureType.featureName;
    isPaused = feature.paused && !isStaff;
    const missiveConfig = missiveFeatureSchema.parse(feature.featureData);
    pngCountsAsDowntime = missiveConfig.pngCountsAsDowntime;
    maxMissivePerEvent =
      missiveConfig.maxPerEvent +
      character.missivePointsBonus +
      sumPointBonuses(missiveConfig.pointBonuses, character.id);
    canAnswer = missiveConfig.canAnswer;

    const campaignCharacters = await listCampaignCharacters(
      prisma,
      campaign.id
    );
    missiveReceivers = campaignCharacters
      .filter(
        candidate =>
          candidate.id !== character.id &&
          getCharacterStatus(candidate) === "approved"
      )
      .map(candidate => ({
        id: candidate.id,
        name: candidate.name,
        avatar: candidate.avatar,
        type: candidate.type,
      }));
  } else {
    const feature = await getFeatureByFunctionName(
      prisma,
      campaign.id,
      functionName,
      { activeOnly: false }
    );
    if (feature && !feature.active) {
      notFound();
    }
    featureName = feature?.featureType.featureName ?? "Downtime";
    isPaused = (feature?.paused ?? false) && !isStaff;

    downtimeCategories =
      downtimeFeatureSchema.safeParse(feature?.featureData ?? {}).data
        ?.categories ?? [];

    const ownedTalentIds = new Set<number>();
    downtimeTalents = (
      await listCharacterDataForCharacterWithDetails(prisma, character.id)
    )
      .filter(
        entry =>
          entry.dataType.kind === DataTypeKind.talent &&
          (entry.referenceData.flags as { isDowntimeUsable?: boolean } | null)
            ?.isDowntimeUsable === true
      )
      .filter(entry => {
        if (ownedTalentIds.has(entry.referenceData.id)) return false;
        ownedTalentIds.add(entry.referenceData.id);
        return true;
      })
      .map(entry => ({
        id: entry.referenceData.id,
        name: entry.referenceData.name,
        description: entry.referenceData.description,
      }));
  }

  return (
    <>
      <BtnLink
        href={routes.campaignCharacter(campaignSlug, character.id)}
        icon="arrow_back"
        label="Torna alla scheda"
      />
      <HeroPage
        title={featureName}
        action={
          <>
            {isMissive ? (
              <Badge
                color={
                  character.missivePoints > 0 ? "var(--info)" : "var(--fail)"
                }
                icon="mail"
                label={
                  isMaster
                    ? "lo staff non ha limiti di missive"
                    : `${character.missivePoints}/${maxMissivePerEvent} missive`
                }
              />
            ) : (
              <Badge
                color={
                  character.downtimePoints > 0 ? "var(--info)" : "var(--fail)"
                }
                icon="downtime"
                label={`${character.downtimePoints} punti downtime`}
              />
            )}
            <Card className="p-1 pl-3 gap-3">
              <Text size={2} children={character.name} />
              <AvatarUser text={character.name} src={character.avatar} />
            </Card>
          </>
        }
      />

      {isPaused ? (
        <EmptyCard
          icon="pause_circle"
          title={
            isMissive
              ? "Invio missive sospeso"
              : "Invio azioni downtime sospeso"
          }
          message={
            isMissive
              ? "Lo staff ha sospeso l'invio di nuove missive e delle risposte da parte dei personaggi. Riprova più tardi."
              : "Lo staff ha sospeso la dichiarazione di nuove azioni downtime da parte dei personaggi. Riprova più tardi."
          }
        />
      ) : isMissive ? (
        <MissiveWriter
          characterId={character.id}
          campaignSlug={campaignSlug}
          missivePoints={character.missivePoints}
          downtimePoints={character.downtimePoints}
          pngCountsAsDowntime={pngCountsAsDowntime}
          receivers={missiveReceivers}
          isMaster={isMaster}
          canAnswer={canAnswer}
        />
      ) : (
        <DowntimeWriter
          characterId={character.id}
          campaignSlug={campaignSlug}
          downtimePoints={character.downtimePoints}
          categories={downtimeCategories}
          talents={downtimeTalents}
        />
      )}
    </>
  );
}
