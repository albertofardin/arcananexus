import { queryOptions, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { featureTypeSchema } from "@/lib/validations/feature";

const featureTypesResponseSchema = z.array(featureTypeSchema);

const fetchFeatureTypes = async () => {
  const res = await fetch("/api/feature-types");
  if (!res.ok) throw new Error("Failed to load feature types");
  return featureTypesResponseSchema.parse(await res.json());
};

// Catalogo `FeatureType` (T-019), platform-wide: nessuna dipendenza dallo
// slug campagna, la query key resta fissa.
export const useQueryFeatureTypes = () =>
  useQuery(
    queryOptions({
      queryKey: ["feature-types"] as const,
      queryFn: fetchFeatureTypes,
    })
  );
