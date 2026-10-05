import { notFound } from "next/navigation";
import { headers } from "next/headers";
import DowntimeReader from "@/components/DowntimeReader";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isUserCampaignHelper } from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { listUserCharacters } from "@/lib/repositories/character.repository";
import {
  getDowntimeByIdScoped,
  type DowntimeViewer,
} from "@/lib/repositories/downtime.repository";
import BtnLink from "@/components/_core/BtnLink";
import { routes } from "@/app/routes";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

const ALL_USER_CHARACTERS = 1000;

export default async function Page({
  params,
}: {
  params: Promise<{ campaignSlug: string; id: string }>;
}) {
  const { campaignSlug, id } = await params;
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

  const actionId = Number(id);
  if (!Number.isInteger(actionId) || actionId <= 0) {
    notFound();
  }

  const isMaster = await isUserCampaignHelper(
    prisma,
    session.user.id,
    campaign.id
  );

  const viewer: DowntimeViewer = isMaster
    ? { isMaster: true }
    : {
        isMaster: false,
        characterIds: (
          await listUserCharacters(prisma, {
            userId: session.user.id,
            campaignSlug,
            take: ALL_USER_CHARACTERS,
          })
        ).map(character => character.id),
      };

  const downtime = await getDowntimeByIdScoped(prisma, {
    campaignId: campaign.id,
    actionId,
    viewer,
  });
  if (!downtime) {
    notFound();
  }

  const actionData = downtime.actionData as {
    subject?: string;
    description?: string;
  } | null;

  // Solo un master apre il dettaglio di una downtime la segna come letta —
  // un giocatore che apre la propria downtime non la segna mai come letta
  // (sa già cosa ha scritto), stesso gate enforced server-side anche in
  // `PATCH .../downtime/[id]/read`, questo è solo per decidere se montare
  // il componente che spara la richiesta.
  const markAsRead = isMaster && !downtime.readDate;

  return (
    <>
      <BtnLink
        href={routes.campaignDowntime(campaignSlug)}
        icon="arrow_back"
        label="Torna alle downtime"
      />

      <DowntimeReader
        campaignSlug={campaignSlug}
        downtimeId={downtime.id}
        subject={actionData?.subject ?? ""}
        categoryName={downtime.category}
        description={actionData?.description ?? ""}
        author={{
          avatar: downtime.author.avatar,
          name: downtime.author.name,
          userName: downtime.author.userName,
        }}
        markAsRead={markAsRead}
        status={downtime.status}
        response={downtime.response}
        masterNote={isMaster ? downtime.masterNote : null}
        creationDate={downtime.creationDate}
        updateDate={downtime.updateDate}
        isMaster={isMaster}
      />
    </>
  );
}
