// Guardia "owner o master" a livello di personaggio: eseguita una sola volta
// qui, copre la scheda (page.tsx) e le sue azioni ([actionType]/page.tsx),
// che in App Router sono entrambe figlie di questo layout. Stesso pattern di
// CampaignAdminLayout (T-3): un solo punto di applicazione dell'invariante,
// niente controllo duplicato in ogni pagina figlia.
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  isUserCampaignMaster,
  isUserCampaignHelper,
} from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { getCharacterByIdScoped } from "@/lib/repositories/character.repository";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

export default async function CharacterLayout({
  children,
  params,
}: {
  children: React.ReactNode;
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

  // `getCharacterByIdScoped` (non `getCharacterInCampaign`): stessa funzione
  // richiamata da `page.tsx`/`getCharacterEditorData` per questa stessa
  // request — `cache()` la deduplica invece di far girare 3 query
  // `Character` diverse per un solo caricamento di pagina.
  const characterId = Number(id);
  const character = Number.isInteger(characterId)
    ? await getCharacterByIdScoped(
        prisma,
        characterId,
        ARCANA_DOMINE_SLUG,
        campaignSlug
      )
    : null;
  if (!character) {
    notFound();
  }

  const isOwner = character.userId === session.user.id;
  const isHelper = await isUserCampaignHelper(
    prisma,
    session.user.id,
    campaign.id
  );
  const isMaster = await isUserCampaignMaster(
    prisma,
    session.user.id,
    campaign.id
  );

  if (!isOwner && !isMaster && !isHelper) {
    notFound();
  }

  return children;
}
