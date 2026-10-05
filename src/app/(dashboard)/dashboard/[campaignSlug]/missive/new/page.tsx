import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  isUserCampaignMaster,
  isUserCampaignHelper,
} from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import {
  listUserCharacters,
  listCampaignCharacters,
} from "@/lib/repositories/character.repository";
import { getFeatureByFunctionName } from "@/lib/repositories/feature.repository";
import { FT_MISSIVE } from "@/lib/features/featuresName";
import { missiveFeatureSchema } from "@/lib/features/handlers/missive";
import { getCharacterStatus } from "@/components/BadgeCharacterStatus";
import {
  MissiveSenderForm,
  type MissiveSenderCharacter,
  type MissiveReceiver,
} from "@/components/MissiveWriter";
import HeroPage from "@/components/HeroPage";
import { EmptyCard } from "@/components/Feedback";
import BtnLink from "@/components/_core/BtnLink";
import { routes } from "@/app/routes";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";
import { sumPointBonuses } from "@/lib/features/pointBonus";

export default async function Page({
  params,
}: {
  params: Promise<{ campaignSlug: string }>;
}) {
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

  const isMaster = await isUserCampaignMaster(
    prisma,
    session.user.id,
    campaign.id
  );
  // Soglia "staff della campagna" (T-0xx, sospensione lato PG): stesso
  // concetto di `characters/[id]/[actionType]/page.tsx` — più ampia di
  // `isMaster` sopra (include anche il supporter/helper), usata SOLO per
  // decidere se questa pagina è bloccata da `Feature.paused`.
  const isStaff = await isUserCampaignHelper(
    prisma,
    session.user.id,
    campaign.id
  );

  const feature = await getFeatureByFunctionName(
    prisma,
    campaign.id,
    FT_MISSIVE
  );
  if (!feature) {
    notFound();
  }
  const isPaused = feature.paused && !isStaff;
  const { maxPerEvent, pngCountsAsDowntime, canAnswer, pointBonuses } =
    missiveFeatureSchema.parse(feature.featureData);

  const [ownCharactersRaw, campaignCharacters] = await Promise.all([
    listUserCharacters(prisma, { userId: session.user.id, campaignSlug }),
    listCampaignCharacters(prisma, campaign.id),
  ]);

  const ownCharacters: MissiveSenderCharacter[] = ownCharactersRaw
    .filter(character => getCharacterStatus(character) === "approved")
    .map(character => ({
      id: character.id,
      name: character.name,
      avatar: character.avatar,
      missivePoints: character.missivePoints,
      downtimePoints: character.downtimePoints,
      missivePointsBonus:
        character.missivePointsBonus +
        sumPointBonuses(pointBonuses, character.id),
    }));

  const receivers: MissiveReceiver[] = campaignCharacters
    .filter(character => getCharacterStatus(character) === "approved")
    .map(character => ({
      id: character.id,
      name: character.name,
      avatar: character.avatar,
      type: character.type,
    }));

  return (
    <>
      <BtnLink
        href={routes.campaignMissive(campaignSlug)}
        icon="arrow_back"
        label="Torna alle missive"
      />
      <HeroPage title="Nuova missiva" />

      {isPaused ? (
        <EmptyCard
          icon="pause_circle"
          title="Invio missive sospeso"
          message="Lo staff ha sospeso l'invio di nuove missive e delle risposte da parte dei personaggi. Riprova più tardi."
        />
      ) : (
        <MissiveSenderForm
          campaignSlug={campaignSlug}
          isMaster={isMaster}
          ownCharacters={ownCharacters}
          receivers={receivers}
          maxPerEvent={maxPerEvent}
          pngCountsAsDowntime={pngCountsAsDowntime}
          canAnswer={canAnswer}
        />
      )}
    </>
  );
}
