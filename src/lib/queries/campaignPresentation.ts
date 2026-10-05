import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  campaignPresentationSchema,
  type CampaignPresentation,
} from "@/lib/validations/campaignPresentationUpload";

const fetchCampaignPresentation = async (
  campaignSlug: string
): Promise<CampaignPresentation> => {
  const res = await fetch(`/api/campaigns/${campaignSlug}/presentation`);
  if (!res.ok) throw new Error("Failed to load campaign presentation");
  return campaignPresentationSchema.parse(await res.json());
};

export const campaignPresentationQueryKey = (campaignSlug: string) =>
  ["campaign-presentation", campaignSlug] as const;

export const useQueryCampaignPresentation = (campaignSlug: string) =>
  useQuery(
    queryOptions({
      queryKey: campaignPresentationQueryKey(campaignSlug),
      queryFn: () => fetchCampaignPresentation(campaignSlug),
      enabled: !!campaignSlug,
    })
  );
