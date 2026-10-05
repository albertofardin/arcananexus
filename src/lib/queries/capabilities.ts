import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  capabilitiesResponseSchema,
  type CapabilitiesResponse,
} from "@/lib/validations/capabilities";

const fetchCapabilities = async (): Promise<CapabilitiesResponse> => {
  const res = await fetch("/api/me/capabilities");
  if (!res.ok) throw new Error("Failed to load capabilities");
  return capabilitiesResponseSchema.parse(await res.json());
};

export const useCapabilities = () =>
  useQuery(
    queryOptions({
      queryKey: ["me", "capabilities"] as const,
      queryFn: fetchCapabilities,
    })
  );

// Chi vede il pulsante "Nuovo evento": lo sviluppo web ovunque; il direttivo
// solo dove non è legato a una campagna specifica (può creare solo eventi
// "senza campagna"); i master solo per le proprie campagne (nella lista
// globale, senza campagna, basta esserlo di una qualsiasi).
export const useCanCreateEvent = (campaignSlug?: string): boolean => {
  const { data } = useCapabilities();
  if (!data) return false;
  if (data.isSviluppo) return true;
  if (!campaignSlug) return data.isDirettivo || data.masterCampaigns.length > 0;
  return data.masterCampaigns.includes(campaignSlug);
};
