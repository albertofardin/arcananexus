"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import ModalCreateCampaign from "./ModalCreateCampaign";
import ModalEditCampaign from "./ModalEditCampaign";
import ModalDeleteCampaign from "./ModalDeleteCampaign";
import ModalConfirmVisibility from "./ModalConfirmVisibility";
import Card from "@/components/_core/Card";
import Text from "@/components/_core/Text";
import Icon from "@/components/_core/Icon";
import Btn from "@/components/_core/Btn";
import Divider from "@/components/_core/Divider";
import Skeleton from "@/components/_core/Skeleton";
import Badge from "@/components/_core/Badge";
import { ErrorCard } from "@/components/Feedback";
import HeroPage from "@/components/HeroPage";
import BtnCampaign from "@/components/BtnCampaign";
import { useToast } from "@/components/_core/Toast";
import { useCapabilities } from "@/lib/queries/capabilities";
import { useQueryCampaigns, campaignsQueryKey } from "@/lib/queries/campaigns";
import { routes } from "@/app/routes";
import type { Campaign } from "@/lib/validations/campaign";

// Schermata di gestione campagne a livello organizzazione: creare, modificare
// (nome/slug), nascondere/rendere pubblica ed eliminare qualunque campagna.
// Riservata alla sezione Amministrazione (gate lato server nel layout
// `dashboard/admin`): chiunque vi acceda vede l'elenco completo (incluse le
// campagne nascoste, vedi `useQueryCampaigns`/`GET /api/campaigns`), ma solo
// Sviluppo Web (isSviluppo) può modificarlo — un direttivo non-sviluppo la
// vede in sola lettura, stesso principio già applicato in ManagerRolesAdmin
// per lo staff di campagna.
const ManagerCampaigns = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { data: capabilities } = useCapabilities();
  const isSviluppo = capabilities?.isSviluppo ?? false;

  const { data: campaigns, isLoading, error, refetch } = useQueryCampaigns();

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editCampaign, setEditCampaign] = React.useState<Campaign | null>(null);
  const [deleteCampaign, setDeleteCampaign] = React.useState<Campaign | null>(
    null
  );
  const [visibilityCampaign, setVisibilityCampaign] =
    React.useState<Campaign | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = React.useState(false);
  const [visibilitySubmitting, setVisibilitySubmitting] = React.useState(false);

  const invalidateCampaigns = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: campaignsQueryKey() }),
    [queryClient]
  );

  const handleConfirmDelete = React.useCallback(async () => {
    if (!deleteCampaign) return;
    setDeleteSubmitting(true);
    try {
      const res = await fetch(`/api/admin/campaigns/${deleteCampaign.slug}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete campaign");
      await invalidateCampaigns();
      setDeleteCampaign(null);
      showToast({ variant: "success", message: "Campagna eliminata" });
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: "Errore durante l'eliminazione della campagna",
      });
    } finally {
      setDeleteSubmitting(false);
    }
  }, [deleteCampaign, invalidateCampaigns, showToast]);

  const handleConfirmVisibility = React.useCallback(async () => {
    if (!visibilityCampaign) return;
    setVisibilitySubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/campaigns/${visibilityCampaign.slug}/visibility`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            visibility: !visibilityCampaign.visibility,
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to toggle visibility");
      await invalidateCampaigns();
      setVisibilityCampaign(null);
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: "Errore durante il cambio di visibilità",
      });
    } finally {
      setVisibilitySubmitting(false);
    }
  }, [visibilityCampaign, invalidateCampaigns, showToast]);

  const list = campaigns ?? [];

  return (
    <>
      <HeroPage
        title="Gestione Campagne"
        subtitle="Crea, modifica, nascondi o elimina le campagne dell'associazione"
        action={
          isSviluppo && (
            <Btn
              variant="bold"
              icon="dashboard_add"
              label="Nuova campagna"
              onClick={() => setCreateOpen(true)}
            />
          )
        }
      />

      <Card className="min-h-fit flex flex-col items-stretch justify-start p-0">
        {isLoading ? (
          <div className="flex flex-col gap-1 p-2">
            <Skeleton className="h-[66px] w-full" />
            <Skeleton className="h-[66px] w-full" />
            <Skeleton className="h-[66px] w-full" />
          </div>
        ) : error ? (
          <div className="p-3">
            <ErrorCard onRetry={() => refetch()} />
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted-bg">
              <Icon size="lg" className="text-muted-fg" children="castle" />
            </div>
            <Text size={2} weight="bolder" children="Nessuna campagna" />
            <Text
              className="text-muted-fg text-center"
              children="Crea la prima campagna dell'associazione."
            />
          </div>
        ) : (
          <div className="flex flex-col p-2">
            {list.map(campaign => (
              <React.Fragment key={campaign.id}>
                <div className="flex flex-wrap items-center gap-3 p-2 rounded hover:bg-accent">
                  <BtnCampaign
                    size={[90, 50]}
                    camps={[campaign]}
                    slcCamp={campaign}
                  />
                  <div className="min-w-[160px] flex-1">
                    <Text
                      size={2}
                      weight="bolder"
                      ellipsis
                      children={campaign.name}
                    />
                    <Text
                      size={0}
                      className="text-muted-fg"
                      ellipsis
                      children={`/${campaign.slug}`}
                    />
                  </div>
                  <Badge
                    color={
                      campaign.visibility ? "var(--succ)" : "var(--muted-fg)"
                    }
                    icon={campaign.visibility ? "visibility" : "visibility_off"}
                    label={campaign.visibility ? "Pubblica" : "Nascosta"}
                  />
                  <Btn
                    icon="master"
                    tooltip="Gestisci ruoli"
                    onClick={() =>
                      router.push(
                        `${routes.adminRoles()}?scope=${campaign.slug}` as never
                      )
                    }
                  />
                  {isSviluppo && (
                    <div className="flex items-center gap-1">
                      <Btn
                        icon="edit"
                        tooltip="Modifica"
                        onClick={() => setEditCampaign(campaign)}
                      />
                      <Btn
                        icon={
                          campaign.visibility ? "visibility_off" : "visibility"
                        }
                        tooltip={
                          campaign.visibility
                            ? "Rendi privata"
                            : "Rendi pubblica"
                        }
                        onClick={() => setVisibilityCampaign(campaign)}
                      />
                      <Btn
                        icon="delete"
                        tooltip="Elimina"
                        color="var(--fail)"
                        onClick={() => setDeleteCampaign(campaign)}
                      />
                    </div>
                  )}
                </div>
                <Divider className="last:hidden mx-2" />
              </React.Fragment>
            ))}
          </div>
        )}
      </Card>

      <ModalCreateCampaign
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={invalidateCampaigns}
      />
      <ModalEditCampaign
        campaign={editCampaign}
        onClose={() => setEditCampaign(null)}
        onUpdated={invalidateCampaigns}
      />
      <ModalDeleteCampaign
        campaign={deleteCampaign}
        submitting={deleteSubmitting}
        onClose={() => setDeleteCampaign(null)}
        onConfirm={handleConfirmDelete}
      />
      <ModalConfirmVisibility
        open={!!visibilityCampaign}
        campaignName={visibilityCampaign?.name ?? ""}
        nextVisibility={!visibilityCampaign?.visibility}
        submitting={visibilitySubmitting}
        onClose={() => setVisibilityCampaign(null)}
        onConfirm={handleConfirmVisibility}
      />
    </>
  );
};

export default ManagerCampaigns;
