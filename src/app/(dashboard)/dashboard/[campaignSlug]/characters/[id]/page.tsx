import { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getCharacterByIdScoped } from "@/lib/repositories/character.repository";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";
import { routes } from "@/app/routes";
import { CharacterPage } from "@/components/CharacterPage";

type IPage = {
  params: Promise<{
    campaignSlug: string;
    id: string;
  }>;
};

// `getCharacterByIdScoped` (già `cache()`-wrapped nel repository): stessa
// query riusata dal layout e da `getCharacterEditorData` sotto, deduplicata
// per l'intera request invece di una `select`-only dedicata solo ai metadata.
export async function generateMetadata({ params }: IPage): Promise<Metadata> {
  const { campaignSlug, id } = await params;
  const character = await getCharacterByIdScoped(
    prisma,
    parseInt(id),
    ARCANA_DOMINE_SLUG,
    campaignSlug
  );

  if (!character) {
    return { title: "Personaggio Non Trovato" };
  }

  return {
    title: `${character.name} | Arcana Domine`,
    description: `Dettagli del personaggio ${character.name}`,
  };
}

export default async function Page({ params }: IPage) {
  const { campaignSlug, id } = await params;

  return (
    <CharacterPage
      campaignSlug={campaignSlug}
      id={id}
      backHref={routes.campaignCharacters(campaignSlug)}
    />
  );
}
