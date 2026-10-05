import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  dataRequirementsGraphSchema,
  type DataRequirementsGraph,
} from "@/lib/validations/dataRequirement";

// Grafo dei requisiti (`requires`/`blocks`, T-016/T-027) in uscita/entrata di
// una `ReferenceData`: usato dalla sezione "Requisiti" del form di edit
// (T-030), disponibile solo per una voce già esistente (`referenceDataId`
// non nullo — in creazione non c'è ancora un id su cui appendere archi).
const fetchDataRequirements = async (
  campaignSlug: string,
  referenceDataId: number
): Promise<DataRequirementsGraph> => {
  const res = await fetch(
    `/api/campaigns/${campaignSlug}/reference-data/${referenceDataId}/requirements`
  );
  if (!res.ok) throw new Error("Failed to load data requirements");
  return dataRequirementsGraphSchema.parse(await res.json());
};

export const dataRequirementsQueryKey = (
  campaignSlug: string,
  referenceDataId: number | null
) =>
  ["reference-data-requirements", campaignSlug, referenceDataId ?? 0] as const;

export const useQueryDataRequirements = (
  campaignSlug: string,
  referenceDataId: number | null
) =>
  useQuery(
    queryOptions({
      queryKey: dataRequirementsQueryKey(campaignSlug, referenceDataId),
      queryFn: () =>
        fetchDataRequirements(campaignSlug, referenceDataId as number),
      enabled: !!campaignSlug && referenceDataId !== null,
    })
  );
