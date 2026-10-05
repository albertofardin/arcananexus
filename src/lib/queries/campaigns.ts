import { queryOptions, useQuery } from "@tanstack/react-query";
import { Campaign } from "@/lib/validations/campaign";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

const fetchCampaigns = async (): Promise<Campaign[]> => {
  const res = await fetch(`/api/campaigns?orgSlug=${ARCANA_DOMINE_SLUG}`);
  if (!res.ok) throw new Error("Failed to load campaigns");
  return res.json();
};

export const campaignsQueryKey = () =>
  ["campaigns", ARCANA_DOMINE_SLUG] as const;

export const useQueryCampaigns = (enabled = true) =>
  useQuery(
    queryOptions({
      queryKey: campaignsQueryKey(),
      queryFn: fetchCampaigns,
      enabled,
    })
  );
