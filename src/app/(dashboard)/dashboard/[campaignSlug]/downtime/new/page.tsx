import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isUserCampaignHelper } from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { listUserCharacters } from "@/lib/repositories/character.repository";
import { getFeatureByFunctionName } from "@/lib/repositories/feature.repository";
import { FT_DOWNTIME } from "@/lib/features";
import { downtimeFeatureSchema } from "@/lib/features/handlers/downtime";
import { getCharacterStatus } from "@/components/BadgeCharacterStatus";
import {
  DowntimeSenderForm,
  type DowntimeSenderCharacter,
} from "@/components/DowntimeWriter";
import HeroPage from "@/components/HeroPage";
import { EmptyCard } from "@/components/Feedback";
import BtnLink from "@/components/_core/BtnLink";
import { routes } from "@/app/routes";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

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

  // Stesso gate della pagina giocatore (`characters/[id]/[actionType]`,
  // ramo downtime): `FT_DOWNTIME` è il "contenitore" che governa
  // l'attivazione della funzione per la campagna, mai eseguibile come
  // azione — una `Feature` disattivata (`active: false`) chiude la pagina.
  const feature = await getFeatureByFunctionName(
    prisma,
    campaign.id,
    FT_DOWNTIME,
    { activeOnly: false }
  );
  if (feature && !feature.active) {
    notFound();
  }
  // Soglia "staff della campagna" (T-0xx, sospensione lato PG): vedi lo
  // stesso gate in `characters/[id]/[actionType]/page.tsx`.
  const isStaff = await isUserCampaignHelper(
    prisma,
    session.user.id,
    campaign.id
  );
  const isPaused = (feature?.paused ?? false) && !isStaff;

  const categories =
    downtimeFeatureSchema.safeParse(feature?.featureData ?? {}).data
      ?.categories ?? [];

  const ownCharactersRaw = await listUserCharacters(prisma, {
    userId: session.user.id,
    campaignSlug,
  });
  const ownCharacters: DowntimeSenderCharacter[] = ownCharactersRaw
    .filter(character => getCharacterStatus(character) === "approved")
    .map(character => ({
      id: character.id,
      name: character.name,
      avatar: character.avatar,
      downtimePoints: character.downtimePoints,
    }));

  return (
    <>
      <BtnLink
        href={routes.campaignDowntime(campaignSlug)}
        icon="arrow_back"
        label="Torna alle downtime"
      />
      <HeroPage title="Nuovo downtime" />

      {isPaused ? (
        <EmptyCard
          icon="pause_circle"
          title="Invio azioni downtime sospeso"
          message="Lo staff ha sospeso la dichiarazione di nuove azioni downtime da parte dei personaggi. Riprova più tardi."
        />
      ) : (
        <DowntimeSenderForm
          campaignSlug={campaignSlug}
          ownCharacters={ownCharacters}
          categories={categories}
        />
      )}
    </>
  );
}
