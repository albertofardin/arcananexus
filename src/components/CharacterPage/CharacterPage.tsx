import { notFound } from "next/navigation";
import { headers } from "next/headers";
import BtnDeleteCharacter from "./BtnDeleteCharacter";
import CharacterEditor from "@/components/CharacterEditor";
import BtnLink from "@/components/_core/BtnLink";
import HeroPage from "@/components/HeroPage";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isUserCampaignMaster } from "@/lib/authorization";
import { getCharacterByIdScoped } from "@/lib/repositories/character.repository";
import { getCharacterEditorData } from "@/lib/services/characterEditor.service";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

export interface ICharacterPage {
  campaignSlug: string;
  id: string;
  /** Elenco a cui tornare (link "indietro" e redirect dopo l'eliminazione). */
  backHref: string;
}

// Scheda personaggio condivisa tra la vista giocatore (`characters/[id]`) e
// quella staff (`admin/characters/[id]`): cambia solo l'elenco di ritorno.
// `isMaster` dell'editor è risolto da `getCharacterEditorData` in base al ruolo
// reale e alla proprietà del personaggio (`resolveIsMaster`): un supporter
// vede in sola lettura le schede altrui.
const CharacterPage = async ({
  campaignSlug,
  id,
  backHref,
}: ICharacterPage) => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    notFound();
  }

  const characterEditorProps = await getCharacterEditorData(prisma, {
    characterId: parseInt(id),
    orgSlug: ARCANA_DOMINE_SLUG,
    campaignSlug,
    sessionUserId: session.user.id,
  });

  if (!characterEditorProps) {
    notFound();
  }

  // Già in cache (stessa request di `getCharacterEditorData`).
  const character = await getCharacterByIdScoped(
    prisma,
    parseInt(id),
    ARCANA_DOMINE_SLUG,
    campaignSlug
  );
  const canDelete =
    !!character &&
    (await isUserCampaignMaster(prisma, session.user.id, character.campaignId));

  return (
    <>
      <div className="flex items-center gap-2">
        <BtnLink
          href={backHref}
          icon="arrow_back"
          label="Torna ai personaggi"
        />
        <div className="flex-1" />
        {character && canDelete && (
          <BtnDeleteCharacter
            characterId={character.id}
            characterName={characterEditorProps.initial.name}
            campaignSlug={campaignSlug}
            redirectHref={backHref}
          />
        )}
      </div>
      <HeroPage title="Scheda Personaggio" />
      <CharacterEditor {...characterEditorProps} />
    </>
  );
};

export default CharacterPage;
