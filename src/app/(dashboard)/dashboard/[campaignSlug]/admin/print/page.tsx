import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { Role } from "@prisma/client";
import PrintArea from "@/components/PrintArea";
import BtnLink from "@/components/_core/BtnLink";
import { EmptyCard } from "@/components/Feedback";
import { routes } from "@/app/routes";
import { prisma } from "@/lib/db";
import { checkCampaignAccess, getEffectiveUserId } from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { getCharacterStatus } from "@/components/BadgeCharacterStatus/status";
import { listCampaignCharactersForPrint } from "@/lib/repositories/character.repository";
import { listDataTypes } from "@/lib/repositories/dataType.repository";
import { listReferenceDataForCampaign } from "@/lib/repositories/referenceData.repository";
import { listPrintLayouts } from "@/lib/repositories/printLayout.repository";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

type PageProps = {
  params: Promise<{
    campaignSlug: string;
  }>;
};

export default async function Page({ params }: PageProps) {
  const { campaignSlug } = await params;
  const userId = await getEffectiveUserId(await headers());

  const campaign = userId
    ? await getCampaignBySlug(prisma, campaignSlug, ARCANA_DOMINE_SLUG)
    : null;
  if (!userId || !campaign) {
    notFound();
  }

  const back = (
    <BtnLink
      href={routes.campaignAdmin(campaignSlug)}
      icon="arrow_back"
      label="Torna a Gestione Campagna"
    />
  );

  // Stessa soglia delle route API (`print-layouts`, `print-data`): la stampa
  // espone voci e note non visibili ai giocatori.
  if (!(await checkCampaignAccess(prisma, userId, campaign.id, Role.master))) {
    return (
      <>
        {back}
        <EmptyCard
          icon="lock"
          title="Permessi insufficienti"
          message="L'Area Stampa è riservata ai master della campagna"
        />
      </>
    );
  }

  const [layouts, characters, dataTypes, entries] = await Promise.all([
    listPrintLayouts(prisma, campaign.id),
    listCampaignCharactersForPrint(prisma, campaign.id),
    listDataTypes(prisma, campaign.id),
    listReferenceDataForCampaign(prisma, campaign.id),
  ]);

  return (
    <>
      {back}
      <PrintArea
        layouts={layouts.map(l => ({
          id: l.id,
          source: l.source,
          name: l.name,
          template: l.template,
          sheet: l.sheet,
          sheetGap: l.sheetGap,
          sheetMargin: l.sheetMargin,
        }))}
        characters={characters.map(c => ({
          id: c.id,
          label: c.name,
          subtitle: c.user.name,
          status: getCharacterStatus(c),
          eventIds: c.bookings.map(b => b.event.id),
        }))}
        // Solo gli eventi con almeno un personaggio iscritto, più recenti prima.
        events={[
          ...new Map(
            characters
              .flatMap(c => c.bookings.map(b => b.event))
              .sort(
                (a, b) =>
                  b.dateEventStart.getTime() - a.dateEventStart.getTime()
              )
              .map(e => [e.id, { id: e.id, name: e.name }])
          ).values(),
        ]}
        dataTypes={dataTypes.map(d => ({ id: d.id, name: d.name }))}
        entries={entries.map(e => ({
          id: e.id,
          label: e.name,
          dataTypeId: e.dataTypeId,
        }))}
      />
    </>
  );
}
