import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  referenceDataAdminListSchema,
  type ReferenceDataAdmin,
} from "@/lib/validations/referenceData";

// Elenco `ReferenceData` della campagna (T-030), filtrato per `dataTypeId`
// quando indicato (`?dataTypeId=`, filtro già supportato dalla route T-016) —
// usato sia dalla lista principale di una categoria (`dataTypeId` valorizzato)
// sia dal selettore "voce da richiedere/bloccare" della sezione requisiti
// (`dataTypeId` omesso: l'intero catalogo della campagna, i requisiti possono
// attraversare categorie diverse).
const fetchCampaignReferenceData = async (
  campaignSlug: string,
  dataTypeId?: number
): Promise<ReferenceDataAdmin[]> => {
  const query = dataTypeId ? `?dataTypeId=${dataTypeId}` : "";
  const res = await fetch(
    `/api/campaigns/${campaignSlug}/reference-data${query}`
  );
  if (!res.ok) throw new Error("Failed to load campaign reference data");
  return referenceDataAdminListSchema.parse(await res.json());
};

export const referenceDataQueryKey = (
  campaignSlug: string,
  dataTypeId?: number
) => ["campaign-reference-data", campaignSlug, dataTypeId ?? "all"] as const;

export const useQueryCampaignReferenceData = (
  campaignSlug: string,
  dataTypeId?: number,
  options?: { enabled?: boolean }
) =>
  useQuery(
    queryOptions({
      queryKey: referenceDataQueryKey(campaignSlug, dataTypeId),
      queryFn: () => fetchCampaignReferenceData(campaignSlug, dataTypeId),
      enabled: (options?.enabled ?? true) && !!campaignSlug,
    })
  );
