import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  characterAcquirableTalentsSchema,
  type CharacterAcquirableTalentsResponse,
} from "@/lib/validations/characterTalents";

// Talenti acquisibili + requisiti di un personaggio (T-0xx): fetch on-demand,
// abilitato solo quando una delle due modali talenti di `CharacterEditor` è
// aperta almeno una volta — vedi il commento su `getCharacterAcquirableTalents`
// per il perché non è più parte del payload eager della scheda PG.
const fetchCharacterTalents = async (
  campaignSlug: string,
  characterId: number,
  asMaster: boolean
): Promise<CharacterAcquirableTalentsResponse> => {
  const res = await fetch(
    `/api/campaigns/${campaignSlug}/characters/${characterId}/talents${asMaster ? "" : "?view=player"}`
  );
  if (!res.ok) throw new Error("Failed to load character talents");
  return characterAcquirableTalentsSchema.parse(await res.json());
};

// Senza `asMaster` la chiave è solo il prefisso (usabile per invalidare
// entrambe le viste, master e player).
export const characterTalentsQueryKey = (
  campaignSlug: string,
  characterId: number,
  asMaster?: boolean
) =>
  asMaster === undefined
    ? (["character-talents", campaignSlug, characterId] as const)
    : (["character-talents", campaignSlug, characterId, asMaster] as const);

export const useQueryCharacterTalents = (
  campaignSlug: string | undefined,
  characterId: number | undefined,
  enabled: boolean,
  asMaster = true
) =>
  useQuery(
    queryOptions({
      queryKey: characterTalentsQueryKey(
        campaignSlug ?? "",
        characterId ?? 0,
        asMaster
      ),
      queryFn: () =>
        fetchCharacterTalents(
          campaignSlug as string,
          characterId as number,
          asMaster
        ),
      enabled: enabled && !!campaignSlug && characterId !== undefined,
    })
  );
