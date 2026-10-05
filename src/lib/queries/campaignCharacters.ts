import { queryOptions, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { characterSchema } from "@/lib/validations/character";

const campaignCharactersResponseSchema = z.array(characterSchema);

const fetchCampaignCharacters = async (campaignSlug: string) => {
  const res = await fetch(`/api/campaigns/${campaignSlug}/characters`);
  if (!res.ok) throw new Error("Failed to load campaign characters");
  return campaignCharactersResponseSchema.parse(await res.json());
};

export const useQueryCampaignCharacters = (campaignSlug: string) =>
  useQuery(
    queryOptions({
      queryKey: ["campaign-characters", campaignSlug] as const,
      queryFn: () => fetchCampaignCharacters(campaignSlug),
      enabled: !!campaignSlug,
    })
  );

// Solo i personaggi (PG+PNG) del giocatore corrente, filtrati per campagna
// dal server (`GET /api/characters` scopa sempre su session.user.id — vedi
// route.ts). Stesso queryKey usato da CharactersList variant "owner", così la
// cache è condivisa.
const fetchMyCharacters = async (campaignSlug: string) => {
  const res = await fetch(`/api/characters?campaignSlug=${campaignSlug}`);
  if (!res.ok) throw new Error("Failed to load characters");
  return campaignCharactersResponseSchema.parse(await res.json());
};

export const useQueryMyCharacters = (campaignSlug: string) =>
  useQuery(
    queryOptions({
      queryKey: ["characters", campaignSlug] as const,
      queryFn: () => fetchMyCharacters(campaignSlug),
      enabled: !!campaignSlug,
    })
  );
