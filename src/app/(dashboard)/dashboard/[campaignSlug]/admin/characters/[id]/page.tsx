import { Metadata } from "next";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { getCharacterMetadataByIdScoped } from "@/lib/repositories/character.repository";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";
import { routes } from "@/app/routes";
import { CharacterPage } from "@/components/CharacterPage";

type PageProps = {
  params: Promise<{
    campaignSlug: string;
    id: string;
  }>;
};

const fetchCharacterMetadata = cache(getCharacterMetadataByIdScoped);

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { campaignSlug, id } = await params;
  const character = await fetchCharacterMetadata(
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

export default async function Page({ params }: PageProps) {
  const { campaignSlug, id } = await params;

  // Raggiungibile da qualunque membro dello staff (vedi `admin/layout.tsx`,
  // soglia `supporter`).
  return (
    <CharacterPage
      campaignSlug={campaignSlug}
      id={id}
      backHref={routes.campaignAdminCharacters(campaignSlug)}
    />
  );
}
