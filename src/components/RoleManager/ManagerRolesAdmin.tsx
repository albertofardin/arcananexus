"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import ManagerRoles, {
  DIRETTIVO_ID,
  SVILUPPO_ID,
  type MockCampaign,
  type Assignment,
  type FlatGroupMembers,
} from "./ManagerRoles";
import { syncCampaignGrants, syncGroupMembers } from "./rolesAssignmentsSync";
import { ROLE_DEFINITIONS } from "./roleDefinitions";
import Card from "@/components/_core/Card";
import Skeleton from "@/components/_core/Skeleton";
import { ErrorCard } from "@/components/Feedback";
import HeroPage from "@/components/HeroPage";
import {
  rolesOverviewResponseSchema,
  type RolesOverviewResponse,
} from "@/lib/validations/adminGroups";
import { useCapabilities } from "@/lib/queries/capabilities";
import { useQueryCampaigns } from "@/lib/queries/campaigns";
import { HARDCODED_SVILUPPO_EMAILS } from "@/lib/constants";

// Schermata di gestione ruoli a livello organizzazione: mostra tutte le
// campagne (staff/Grant) e i due gruppi flat "Direttivo" e "Sviluppo Web".
// - un utente senza accesso ad Amministrazione non arriva qui (gate a monte)
// - le campagne sono visibili a chiunque abbia accesso ad Amministrazione,
//   ma editabili SOLO da Sviluppo Web (isSviluppo): un direttivo non-sviluppo
//   le vede in sola lettura (`editMode="readonly"`); il salvataggio verso il
//   backend è comunque protetto anche lato server da
//   `requireCampaignAdminBySlugOrSviluppo`
// - chi ha accesso ad Amministrazione (isDirettivo o isSviluppo) vede ed edita
//   il gruppo Direttivo
// - SOLO chi è effettivamente Sviluppo Web (isSviluppo) può editare il gruppo
//   Sviluppo Web; un direttivo non-sviluppo lo vede in sola lettura (altrimenti
//   potrebbe auto-promuoversi a Sviluppo Web, che dà accesso
//   all'impersonation); le due email cablate non sono mai rimovibili da quel
//   gruppo, nemmeno da Sviluppo Web (vedi `nonRemovableUserIds`)
const ManagerRolesAdmin = () => {
  const { data: capabilities } = useCapabilities();
  const isSviluppo = capabilities?.isSviluppo ?? false;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Sollevato qui (non dentro ManagerRoles) perché quest'ultimo viene
  // rimontato via `key={dataUpdatedAt}` dopo ogni salvataggio, per
  // risincronizzarsi con i dati freschi — se la selezione vivesse lì dentro,
  // il remount la resetterebbe sempre al Direttivo. Specchiato anche nella
  // querystring (`?scope=`) così un refresh della pagina non perde il
  // gruppo che si stava guardando.
  const [selectedScopeId, setSelectedScopeIdState] = React.useState<string>(
    () => searchParams.get("scope") ?? DIRETTIVO_ID
  );
  const setSelectedScopeId = React.useCallback(
    (id: string) => {
      setSelectedScopeIdState(id);
      const params = new URLSearchParams(searchParams.toString());
      params.set("scope", id);
      router.push(`${pathname}?${params.toString()}` as never, {
        scroll: false,
      });
    },
    [pathname, router, searchParams]
  );

  const { data, isLoading, error, refetch, dataUpdatedAt } =
    useQuery<RolesOverviewResponse>({
      queryKey: ["roles-overview"],
      queryFn: async () => {
        const response = await fetch("/api/admin/association-roles");
        if (!response.ok) {
          throw new Error("Failed to fetch roles overview");
        }
        const json = await response.json();
        return rolesOverviewResponseSchema.parse(json);
      },
    });

  // Logo/cover/colore delle card campagna arrivano dall'endpoint campagne
  // "reale": l'overview ruoli conosce solo id/nome/slug/assegnazioni.
  const { data: fullCampaigns, isLoading: campaignsLoading } =
    useQueryCampaigns();

  const hardcodedSviluppoUserIds = React.useMemo(
    () =>
      data
        ? data.users
            .filter(u =>
              (HARDCODED_SVILUPPO_EMAILS as readonly string[]).includes(u.email)
            )
            .map(u => u.id)
        : [],
    [data]
  );

  const handleSave = React.useCallback(
    async (assignmentsByScope: Record<string, Assignment[]>) => {
      if (!data) return;

      for (const campaign of data.campaigns) {
        const previous: Assignment[] = campaign.assignments.map(a => ({
          userId: a.userId,
          roleId: a.role,
        }));
        const next = assignmentsByScope[campaign.slug] ?? [];
        await syncCampaignGrants(campaign.slug, previous, next);
      }

      const previousDirettivo: Assignment[] = data.direttivoMemberIds.map(
        userId => ({ userId, roleId: DIRETTIVO_ID })
      );
      const nextDirettivo = assignmentsByScope[DIRETTIVO_ID] ?? [];
      await syncGroupMembers("direttivo", previousDirettivo, nextDirettivo);

      const previousSviluppo: Assignment[] = data.sviluppoMemberIds.map(
        userId => ({
          userId,
          roleId: SVILUPPO_ID,
        })
      );
      const nextSviluppo = assignmentsByScope[SVILUPPO_ID] ?? [];
      await syncGroupMembers("sviluppo", previousSviluppo, nextSviluppo);

      await refetch();
    },
    [data, refetch]
  );

  return (
    <>
      <HeroPage
        title="Gestione Ruoli"
        subtitle="Gestisci le campagne, il direttivo e sviluppo web"
      />

      {(isLoading || campaignsLoading) && (
        <div className="min-h-0 flex-1 grid grid-cols-1 gap-2 lg:grid-cols-[320px_1fr] lg:grid-rows-1">
          <Card className="flex-1 flex-col items-start gap-3 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
            <div className="flex-1" />
          </Card>
          <Card className="flex-1 flex-col items-start gap-3 p-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
            <div className="flex-1" />
          </Card>
        </div>
      )}

      {error && (
        <Card className="flex-1 p-3">
          <ErrorCard onRetry={() => refetch()} />
        </Card>
      )}

      {data && fullCampaigns && (
        <ManagerRoles
          key={dataUpdatedAt}
          campaigns={data.campaigns.flatMap(c => {
            const campaign = fullCampaigns.find(fc => fc.slug === c.slug);
            if (!campaign) return [];
            const mockCampaign: MockCampaign = {
              id: c.slug,
              name: c.name,
              slug: c.slug,
              campaign,
              assignments: c.assignments.map(a => ({
                userId: a.userId,
                roleId: a.role,
              })),
            };
            return [mockCampaign];
          })}
          users={data.users}
          roles={ROLE_DEFINITIONS}
          editMode={isSviluppo ? "full" : "readonly"}
          flatGroups={
            [
              { id: DIRETTIVO_ID, memberIds: data.direttivoMemberIds },
              {
                id: SVILUPPO_ID,
                memberIds: data.sviluppoMemberIds,
                editable: isSviluppo,
                nonRemovableUserIds: hardcodedSviluppoUserIds,
              },
            ] satisfies FlatGroupMembers[]
          }
          onSave={handleSave}
          scopeId={selectedScopeId}
          onChangeScopeId={setSelectedScopeId}
        />
      )}
    </>
  );
};

export default ManagerRolesAdmin;
