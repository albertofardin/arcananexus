import { notFound } from "next/navigation";
import { headers } from "next/headers";
import CardCharacterSummary, {
  type CharacterSummary,
} from "./_components/CardCharacterSummary";
import { prisma } from "@/lib/db";
import { getEffectiveUserId } from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { listUserCharacters } from "@/lib/repositories/character.repository";
import { listPublishedEvents } from "@/lib/repositories/event.repository";
import { listFeaturesForCampaign } from "@/lib/repositories/feature.repository";
import { getXpBalance } from "@/lib/services/xp.service";
import { FT_DOWNTIME, FT_MISSIVE } from "@/lib/features";
import { downtimeFeatureSchema } from "@/lib/features/handlers/downtime";
import { missiveFeatureSchema } from "@/lib/features/handlers/missive";
import Card from "@/components/_core/Card";
import BtnLink from "@/components/_core/BtnLink";
import { EventListRow } from "@/components/EventList";
import { EmptyCard } from "@/components/Feedback";
import { getCharacterStatus } from "@/components/BadgeCharacterStatus";
import type { Event } from "@/lib/validations/event";
import type { Campaign as CampaignSummary } from "@/lib/validations/campaign";
import { routes } from "@/app/routes";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";
import BtnCampaign from "@/components/BtnCampaign";
import { sumPointBonuses } from "@/lib/features/pointBonus";

const MAX_UPCOMING_EVENTS = 10;

export default async function Page({
  params,
}: {
  params: Promise<{ campaignSlug: string }>;
}) {
  const { campaignSlug } = await params;
  const headersList = await headers();

  const [campaign, userId] = await Promise.all([
    getCampaignBySlug(prisma, campaignSlug, ARCANA_DOMINE_SLUG),
    getEffectiveUserId(headersList),
  ]);

  if (!campaign) {
    notFound();
  }

  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  const [characters, upcomingEvents, campaignFeatures] = await Promise.all([
    userId
      ? listUserCharacters(prisma, { userId, campaignSlug })
      : Promise.resolve<Awaited<ReturnType<typeof listUserCharacters>>>([]),
    listPublishedEvents(prisma, {
      orgSlug: ARCANA_DOMINE_SLUG,
      campaignSlug,
      startDate: startOfToday,
      sortDirection: "asc",
      page: 1,
      pageSize: MAX_UPCOMING_EVENTS,
    }).then(({ events }) => events),
    // Dipende solo da `campaign.id` (già noto dal primo `Promise.all` sopra):
    // eseguita qui in parallelo con personaggi/evento invece che in un
    // `await` separato dopo, per non aggiungere un intero round-trip DB
    // sequenziale in più ad ogni caricamento della bacheca.
    listFeaturesForCampaign(prisma, campaign.id),
  ]);

  const approvedCharacters = characters.filter(
    character => getCharacterStatus(character) === "approved"
  );

  const isFeatureActive = (functionName: string) =>
    campaignFeatures.some(
      feature =>
        feature.featureType.functionName === functionName && feature.active
    );
  const downtimeActive = isFeatureActive(FT_DOWNTIME);
  const missiveActive = isFeatureActive(FT_MISSIVE);

  const findFeature = (functionName: string) =>
    campaignFeatures.find(
      feature => feature.featureType.functionName === functionName
    );
  const downtimeFeature = findFeature(FT_DOWNTIME);
  const missiveFeature = findFeature(FT_MISSIVE);

  const downtimeConfig = downtimeFeature
    ? downtimeFeatureSchema.parse(downtimeFeature.featureData)
    : undefined;
  const missiveConfig = missiveFeature
    ? missiveFeatureSchema.parse(missiveFeature.featureData)
    : undefined;
  const downtimeMax = downtimeConfig?.maxPoints ?? 0;
  const missiveMax = missiveConfig?.maxPerEvent ?? 0;

  const activeCharacters: CharacterSummary[] = await Promise.all(
    approvedCharacters.map(async character => {
      const xpBalance = await getXpBalance(prisma, character.id);

      return {
        id: character.id,
        name: character.name,
        avatar: character.avatar,
        characterHref: routes.campaignCharacter(campaignSlug, character.id),
        downtimePoints: downtimeActive ? character.downtimePoints : null,
        downtimeMax: downtimeActive
          ? downtimeMax +
            character.downtimePointsBonus +
            sumPointBonuses(downtimeConfig?.pointBonuses ?? [], character.id)
          : null,
        missivePoints: missiveActive ? character.missivePoints : null,
        missiveMax: missiveActive
          ? missiveMax +
            character.missivePointsBonus +
            sumPointBonuses(missiveConfig?.pointBonuses ?? [], character.id)
          : null,
        xpAvailable: xpBalance.available,
      };
    })
  );

  const eventsForList: Event[] = upcomingEvents.map(event => ({
    id: event.id,
    name: event.name,
    place: event.place ?? "",
    image: event.image,
    dateEventStart: event.dateEventStart,
    dateEventEnd: event.dateEventEnd,
    datePublicationStart: event.datePublicationStart,
    datePublicationEnd: event.datePublicationEnd,
    campaignName: campaign.name,
    campaignSlug: campaign.slug,
    campaignColor: campaign.color,
    campaignLogo: campaign.logo,
    bookingCount: event._count.bookings,
  }));

  // BtnCampaign vuole il tipo `Campaign` di validations/campaign.ts
  // (con dataTypes/activeFeatures), non l'entità Prisma restituita da
  // getCampaignBySlug: qui non servono, come in PreviewCover.tsx.
  const campaignForBtn: CampaignSummary = {
    id: campaign.id,
    name: campaign.name,
    slug: campaign.slug,
    logo: campaign.logo,
    cover: campaign.cover,
    color: campaign.color,
    texture: campaign.texture,
    visibility: campaign.visibility,
    dataTypes: [],
    activeFeatures: [],
  };

  return (
    <>
      <BtnCampaign
        camps={[campaignForBtn]}
        slcCamp={campaignForBtn}
        size={[227, 90]}
        className="mt-2"
        style={{ width: "100%", minWidth: 0, maxWidth: "none" }}
      />

      <Card className="flex-col items-stretch justify-start p-2">
        {eventsForList.length > 0 ? (
          eventsForList.map(event => (
            <EventListRow key={event.id} event={event} campaignName={false} />
          ))
        ) : (
          <EmptyCard
            icon="event_busy"
            title="Nessun evento in programma"
            message="Resta in attesa per ulteriori coming soon"
            className="border-0 p-0"
          />
        )}
      </Card>

      {activeCharacters.length > 0 ? (
        <CardCharacterSummary characters={activeCharacters} />
      ) : (
        <Card className="flex min-h-[190px]">
          {characters.length > 0 ? (
            <EmptyCard
              icon="hourglass"
              title="Nessun personaggio attivo: quelli esistenti sono in revisione, in pausa o deceduti"
              className="border-0 p-0"
            />
          ) : (
            <EmptyCard
              icon="person_add"
              title="Nessun personaggio ancora creato"
              message="Crea il tuo primo personaggio per iniziare a giocare in questa campagna"
              className="border-0 p-0"
              action={
                <BtnLink
                  variant="bold"
                  icon="add"
                  label="Crea personaggio"
                  href={routes.campaignCharacterNew(campaignSlug) as never}
                />
              }
            />
          )}
        </Card>
      )}
    </>
  );
}
