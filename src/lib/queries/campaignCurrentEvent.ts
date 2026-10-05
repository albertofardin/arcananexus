import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  campaignCurrentEventSchema,
  type CampaignCurrentEvent,
} from "@/lib/validations/event";

const fetchCampaignCurrentEvent = async (
  campaignSlug: string
): Promise<CampaignCurrentEvent> => {
  const res = await fetch(`/api/campaigns/${campaignSlug}/events/current`);
  if (!res.ok) throw new Error("Failed to load campaign current event");
  return campaignCurrentEventSchema.parse(await res.json());
};

// Evento "corrente" della campagna (admin/progress, T-0xx): usata dalla card
// Evento per decidere fra "vai all'evento" e "crea nuovo evento".
export const useQueryCampaignCurrentEvent = (campaignSlug: string) =>
  useQuery(
    queryOptions({
      queryKey: ["campaign-current-event", campaignSlug] as const,
      queryFn: () => fetchCampaignCurrentEvent(campaignSlug),
      enabled: !!campaignSlug,
    })
  );
