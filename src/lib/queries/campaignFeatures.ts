import { queryOptions, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { featureWithTypeSchema } from "@/lib/validations/feature";

const campaignFeaturesResponseSchema = z.array(featureWithTypeSchema);

const fetchCampaignFeatures = async (campaignSlug: string) => {
  const res = await fetch(`/api/campaigns/${campaignSlug}/features`);
  if (!res.ok) throw new Error("Failed to load campaign features");
  return campaignFeaturesResponseSchema.parse(await res.json());
};

// `Feature` attivate per la campagna corrente (T-019), con `featureType`
// incluso — usata dalla pagina admin/features (T-031) per sapere quali
// `FeatureType` del catalogo sono già configurati.
export const useQueryCampaignFeatures = (campaignSlug: string) =>
  useQuery(
    queryOptions({
      queryKey: ["campaign-features", campaignSlug] as const,
      queryFn: () => fetchCampaignFeatures(campaignSlug),
      enabled: !!campaignSlug,
    })
  );
