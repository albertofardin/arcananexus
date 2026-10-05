"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import ModalFeature from "./ModalFeature";
import ModalFeatureDowntime from "./ModalFeatureDowntime";
import ModalFeatureMissive from "./ModalFeatureMissive";
import ModalFeatureProgress from "./ModalFeatureProgress";
import { mapFeatureErrorMessage } from "./features";
import Card from "@/components/_core/Card";
import Text from "@/components/_core/Text";
import Btn from "@/components/_core/Btn";
import Badge from "@/components/_core/Badge";
import Avatar from "@/components/_core/Avatar";
import Skeleton from "@/components/_core/Skeleton";
import Modal from "@/components/_core/Modal";
import { ErrorCard, EmptyCard } from "@/components/Feedback";
import { useToast } from "@/components/_core/Toast";
import HeroPage from "@/components/HeroPage";
import { useQueryFeatureTypes } from "@/lib/queries/featureTypes";
import { useQueryCampaignFeatures } from "@/lib/queries/campaignFeatures";
import type {
  FeatureTypeDto,
  FeatureWithTypeDto,
} from "@/lib/validations/feature";
import {
  getFeatureIcon,
  FT_DOWNTIME,
  FT_MISSIVE,
  FT_PROGRESS,
} from "@/lib/features/featuresName";
import Divider from "@/components/_core/Divider";
import BtnBase from "@/components/_core/BtnBase";

interface IFeatureTypeRow {
  featureType: FeatureTypeDto;
  active: boolean;
  onConfigure: () => void;
}

const FeatureTypeRow = ({
  featureType,
  active,
  onConfigure,
}: IFeatureTypeRow) => {
  return (
    <>
      <BtnBase
        className="flex w-full items-center gap-3 px-3 py-2 text-left rounded hover:bg-accent"
        onClick={onConfigure}
      >
        <Avatar
          icon={getFeatureIcon(featureType.functionName)}
          className="bg-bg"
        />
        <Text
          className="flex-1"
          size={2}
          weight="bolder"
          children={featureType.featureName}
        />
        <Badge
          disabled={!active}
          color="var(--succ)"
          icon={active ? "circle_check" : "circle"}
          label={active ? "Attivata" : "Disattivata"}
          className="min-w-[100px]"
        />
      </BtnBase>
      <Divider className="last:hidden mx-2" />
    </>
  );
};

const FeaturesManager = () => {
  const params = useParams<{ campaignSlug: string }>();
  const campaignSlug = params.campaignSlug;
  const { showToast } = useToast();

  const {
    data: featureTypes,
    isLoading: featureTypesLoading,
    error: featureTypesError,
    refetch: refetchFeatureTypes,
  } = useQueryFeatureTypes();
  const {
    data: activeFeatures,
    isLoading: featuresLoading,
    error: featuresError,
    refetch: refetchFeatures,
  } = useQueryCampaignFeatures(campaignSlug);
  console.log({
    featureTypes,
    activeFeatures,
  });
  const [configTarget, setConfigTarget] = React.useState<{
    featureType: FeatureTypeDto;
    feature: FeatureWithTypeDto | null;
  } | null>(null);
  const [missiveTarget, setMissiveTarget] = React.useState<{
    featureType: FeatureTypeDto;
    feature: FeatureWithTypeDto | null;
  } | null>(null);
  const [downtimeTarget, setDowntimeTarget] = React.useState<{
    featureType: FeatureTypeDto;
    feature: FeatureWithTypeDto | null;
  } | null>(null);
  const [progressTarget, setProgressTarget] = React.useState<{
    featureType: FeatureTypeDto;
    feature: FeatureWithTypeDto | null;
  } | null>(null);
  const [deactivateTarget, setDeactivateTarget] =
    React.useState<FeatureWithTypeDto | null>(null);
  const [deactivating, setDeactivating] = React.useState(false);

  // `talents`/`deathXpRecovery` (T-0xx, fusione in "Progressione PG",
  // Opzione B): non registrano più un proprio `functionName` nel registry
  // (`progress.ts` è l'unico modulo eseguibile per entrambi), quindi
  // non compaiono più a catalogo — nessun filtro necessario, stesso motivo
  // già documentato per le categorie downtime.
  const genericFeatureTypes = featureTypes ?? [];

  // Include anche le `Feature` disattivate: la modale di configurazione deve
  // poter riproporre l'ultima configurazione salvata quando si riabilita una
  // feature disattivata in precedenza, invece di ripartire da zero.
  const featureByFeatureTypeId = React.useMemo(() => {
    const map = new Map<number, FeatureWithTypeDto>();
    for (const feature of activeFeatures ?? []) {
      map.set(feature.featureTypeId, feature);
    }
    return map;
  }, [activeFeatures]);

  const refetchAll = React.useCallback(() => {
    refetchFeatureTypes();
    refetchFeatures();
  }, [refetchFeatureTypes, refetchFeatures]);

  const handleRequestDeactivate = React.useCallback(
    (feature: FeatureWithTypeDto) => {
      setConfigTarget(null);
      setMissiveTarget(null);
      setDowntimeTarget(null);
      setProgressTarget(null);
      setDeactivateTarget(feature);
    },
    []
  );

  const handleDeactivateConfirm = React.useCallback(async () => {
    if (!deactivateTarget) return;

    setDeactivating(true);
    try {
      const response = await fetch(
        `/api/campaigns/${campaignSlug}/features/${deactivateTarget.id}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const json = await response.json().catch(() => null);
        showToast({
          variant: "error",
          message: mapFeatureErrorMessage(json),
        });
        return;
      }

      showToast({ variant: "success", message: "Feature disattivata" });
      refetchAll();
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: "Errore durante la disattivazione della feature",
      });
    } finally {
      setDeactivating(false);
      setDeactivateTarget(null);
    }
  }, [campaignSlug, deactivateTarget, refetchAll, showToast]);

  const isLoading = featureTypesLoading || featuresLoading;
  const error = featureTypesError || featuresError;

  return (
    <>
      <HeroPage
        title="Feature della campagna"
        subtitle="Attiva e configura le funzioni disponibili (downtime, recupero XP alla morte, …)"
      />

      <Card className="min-h-fit flex flex-col items-stretch justify-start p-0">
        <div className="min-h-0 flex-1 overflow-y-auto flex flex-col p-2">
          {isLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-[84px] w-full" />
              <Skeleton className="h-[84px] w-full" />
              <Skeleton className="h-[84px] w-full" />
            </div>
          ) : error ? (
            <ErrorCard onRetry={refetchAll} />
          ) : !featureTypes || featureTypes.length === 0 ? (
            <EmptyCard
              icon="tune"
              title="Nessuna feature disponibile"
              message="Nessuna funzione è ancora registrata nel catalogo della piattaforma."
            />
          ) : (
            <>
              {genericFeatureTypes.map(featureType => {
                const feature =
                  featureByFeatureTypeId.get(featureType.id) ?? null;

                const handleConfigure = () => {
                  if (featureType.functionName === FT_DOWNTIME) {
                    setDowntimeTarget({ featureType, feature });
                    return;
                  }
                  if (featureType.functionName === FT_MISSIVE) {
                    setMissiveTarget({ featureType, feature });
                    return;
                  }
                  if (featureType.functionName === FT_PROGRESS) {
                    setProgressTarget({ featureType, feature });
                    return;
                  }
                  setConfigTarget({ featureType, feature });
                };

                return (
                  <FeatureTypeRow
                    key={featureType.id}
                    featureType={featureType}
                    active={feature?.active ?? false}
                    onConfigure={handleConfigure}
                  />
                );
              })}
            </>
          )}
        </div>

        <ModalFeature
          open={configTarget !== null}
          onClose={() => setConfigTarget(null)}
          campaignSlug={campaignSlug}
          featureType={configTarget?.featureType ?? null}
          existingFeature={configTarget?.feature ?? null}
          onSaved={refetchAll}
          onRequestDeactivate={handleRequestDeactivate}
        />

        <ModalFeatureMissive
          open={missiveTarget !== null}
          onClose={() => setMissiveTarget(null)}
          campaignSlug={campaignSlug}
          featureType={missiveTarget?.featureType ?? null}
          existingFeature={missiveTarget?.feature ?? null}
          onSaved={refetchAll}
        />

        <ModalFeatureDowntime
          open={downtimeTarget !== null}
          onClose={() => setDowntimeTarget(null)}
          campaignSlug={campaignSlug}
          existingFeature={downtimeTarget?.feature ?? null}
          onSaved={refetchAll}
        />

        <ModalFeatureProgress
          open={progressTarget !== null}
          onClose={() => setProgressTarget(null)}
          campaignSlug={campaignSlug}
          featureType={progressTarget?.featureType ?? null}
          existingFeature={progressTarget?.feature ?? null}
          onSaved={refetchAll}
        />

        <Modal
          open={deactivateTarget !== null}
          onClose={() => setDeactivateTarget(null)}
          title="Disattiva feature"
          content={
            <Text>
              Sei sicuro di voler disattivare la feature{" "}
              <span className="font-bold">
                "{deactivateTarget?.featureType?.featureName}"
              </span>
              ?
              <br />
              La feature verrà disattivata: la configurazione resta salvata e
              potrai riattivarla in seguito.
            </Text>
          }
          actionsLoading={deactivating}
          actions={
            <>
              <Btn label="ANNULLA" onClick={() => setDeactivateTarget(null)} />
              <Btn
                variant="bold"
                label="DISATTIVA"
                color="var(--fail)"
                onClick={handleDeactivateConfirm}
              />
            </>
          }
        />
      </Card>
    </>
  );
};

export default FeaturesManager;
