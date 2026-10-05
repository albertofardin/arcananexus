"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import ManagerRoles, {
  type MockCampaign,
  type Assignment,
  type EditMode,
} from "./ManagerRoles";
import { syncCampaignGrants } from "./rolesAssignmentsSync";
import { ROLE_DEFINITIONS } from "./roleDefinitions";
import Card from "@/components/_core/Card";
import Skeleton from "@/components/_core/Skeleton";
import { ErrorCard } from "@/components/Feedback";
import HeroPage from "@/components/HeroPage";
import Badge from "@/components/_core/Badge";
import {
  campaignGrantsResponseSchema,
  type CampaignGrantsResponse,
} from "@/lib/validations/grant";
import { useQueryCampaigns } from "@/lib/queries/campaigns";

interface IManagerRolesCampaign {
  editMode: EditMode;
}

const ManagerRolesCampaign = ({ editMode }: IManagerRolesCampaign) => {
  const params = useParams<{ campaignSlug: string }>();
  const campaignSlug = params.campaignSlug;

  const { data, isLoading, error, refetch, dataUpdatedAt } =
    useQuery<CampaignGrantsResponse>({
      queryKey: ["campaign-grants", campaignSlug],
      queryFn: async () => {
        const response = await fetch(`/api/campaigns/${campaignSlug}/grants`);
        if (!response.ok) {
          throw new Error("Failed to fetch campaign grants");
        }
        const json = await response.json();
        return campaignGrantsResponseSchema.parse(json);
      },
    });

  const { data: fullCampaigns, isLoading: campaignsLoading } =
    useQueryCampaigns();
  const fullCampaign = fullCampaigns?.find(c => c.slug === campaignSlug);

  const handleSave = React.useCallback(
    async (assignmentsByScope: Record<string, Assignment[]>) => {
      if (!data) return;

      const previous: Assignment[] = data.assignments.map(a => ({
        userId: a.userId,
        roleId: a.role,
      }));
      const next = assignmentsByScope[data.campaign.slug] ?? [];

      await syncCampaignGrants(data.campaign.slug, previous, next);
      await refetch();
    },
    [data, refetch]
  );

  return (
    <>
      <HeroPage
        title="Gestione Staff"
        subtitle="Aggiungi staff ed assegnane i ruoli nella campagna"
        action={
          editMode === "readonly" && (
            <Badge label="Sola lettura" icon="visibility" disabled />
          )
        }
      />

      {(isLoading || campaignsLoading) && (
        <Card className="flex-1 flex-col gap-3 p-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </Card>
      )}

      {error && (
        <Card className="flex-1 p-3">
          <ErrorCard onRetry={() => refetch()} />
        </Card>
      )}

      {data && fullCampaign && (
        <ManagerRoles
          key={dataUpdatedAt}
          campaigns={
            [
              {
                id: data.campaign.slug,
                name: data.campaign.name,
                slug: data.campaign.slug,
                campaign: fullCampaign,
                assignments: data.assignments.map(a => ({
                  userId: a.userId,
                  roleId: a.role,
                })),
              },
            ] as MockCampaign[]
          }
          users={data.users}
          roles={ROLE_DEFINITIONS}
          editMode={editMode}
          onSave={handleSave}
        />
      )}
    </>
  );
};

export default ManagerRolesCampaign;
