import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  dataTypeAdminListSchema,
  type DataTypeAdmin,
} from "@/lib/validations/dataType";

// `includeCount=true` porta anche `_count.referenceData`: la UI admin
// (T-029) lo usa per avvisare l'head_master, alla cancellazione, di quante
// voci di catalogo dipendenti verranno trascinate via (la relazione è
// `onDelete: Cascade`, non un rifiuto lato API — vedi ManagerDataTypes).
const fetchCampaignDataTypes = async (
  campaignSlug: string
): Promise<DataTypeAdmin[]> => {
  const res = await fetch(
    `/api/campaigns/${campaignSlug}/data-types?includeCount=true`
  );
  if (!res.ok) throw new Error("Failed to load campaign data types");
  return dataTypeAdminListSchema.parse(await res.json());
};

export const dataTypesQueryKey = (campaignSlug: string) =>
  ["campaign-data-types", campaignSlug] as const;

export const useQueryCampaignDataTypes = (campaignSlug: string) =>
  useQuery(
    queryOptions({
      queryKey: dataTypesQueryKey(campaignSlug),
      queryFn: () => fetchCampaignDataTypes(campaignSlug),
      enabled: !!campaignSlug,
    })
  );
