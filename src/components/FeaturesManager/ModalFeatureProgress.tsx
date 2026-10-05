"use client";

import * as React from "react";
import { mapFeatureErrorMessage, type FeatureApiErrorBody } from "./features";
import CheckButton from "./CheckButton";
import Text from "@/components/_core/Text";
import Btn from "@/components/_core/Btn";
import FieldText from "@/components/_core/FieldText";
import FieldSelect from "@/components/_core/FieldSelect/FieldSelect";
import Modal from "@/components/_core/Modal";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/components/_core/Toast";
import Card from "@/components/_core/Card";
import type {
  FeatureTypeDto,
  FeatureWithTypeDto,
} from "@/lib/validations/feature";
import { progressFeatureSchema } from "@/lib/features/handlers/progress.schema";

interface ModalFeatureProgressProps {
  open: boolean;
  onClose: () => void;
  campaignSlug: string;
  featureType: FeatureTypeDto | null;
  existingFeature: FeatureWithTypeDto | null;
  onSaved: () => void;
}

const ModalFeatureProgress = ({
  open,
  onClose,
  campaignSlug,
  featureType,
  existingFeature,
  onSaved,
}: ModalFeatureProgressProps) => {
  const wasActive = !!existingFeature?.active;
  const { showToast } = useToast();
  const isMobile = useIsMobile();
  const [saving, setSaving] = React.useState(false);
  const [active, setActive] = React.useState(true);
  // Id della `Feature` salvata in questa sessione della modale: alla prima
  // abilitazione `existingFeature` (prop del parent) resta `null` finché
  // `onSaved` non fa refetch e il parent non ripassa `progressTarget`, cosa
  // che qui non accade perché la modale resta aperta — senza questo stato
  // la sezione con gli altri parametri non comparirebbe mai dopo un POST.
  const [savedFeatureId, setSavedFeatureId] = React.useState<number | null>(
    existingFeature?.id ?? null
  );
  const [talentsEnabled, setTalentsEnabled] = React.useState(false);
  const [deathXpRecoveryEnabled, setDeathXpRecoveryEnabled] =
    React.useState(false);
  const [deathXpRecoveryPercentage, setDeathXpRecoveryPercentage] =
    React.useState("0");

  React.useEffect(() => {
    if (!open) return;
    const parsed = progressFeatureSchema.safeParse(
      existingFeature?.featureData ?? {}
    );
    setActive(existingFeature ? existingFeature.active : true);
    setSavedFeatureId(existingFeature?.id ?? null);
    setTalentsEnabled(parsed.success ? parsed.data.talentsEnabled : false);
    setDeathXpRecoveryEnabled(
      parsed.success ? parsed.data.deathXpRecoveryEnabled : false
    );
    setDeathXpRecoveryPercentage(
      String(parsed.success ? parsed.data.deathXpRecoveryPercentage : 0)
    );
  }, [open, existingFeature]);

  const handleSubmit = React.useCallback(async () => {
    if (!featureType) return;

    const featureData = {
      talentsEnabled,
      // "Statistiche" non è ancora implementata (switch disabilitato in
      // UI, "Coming soon"): l'unico valore che questa modale può produrre
      // oggi è "xp" — il campo resta comunque persistito per non richiedere
      // una migration quando l'altra modalità verrà abilitata.
      progressionMode: "xp" as const,
      deathXpRecoveryEnabled,
      deathXpRecoveryPercentage: Number(deathXpRecoveryPercentage.trim()) || 0,
    };

    setSaving(true);
    try {
      const url = savedFeatureId
        ? `/api/campaigns/${campaignSlug}/features/${savedFeatureId}`
        : `/api/campaigns/${campaignSlug}/features`;
      const response = await fetch(url, {
        method: savedFeatureId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          savedFeatureId
            ? { featureData, active }
            : { featureTypeId: featureType.id, featureData }
        ),
      });

      if (!response.ok) {
        const json = (await response
          .json()
          .catch(() => null)) as FeatureApiErrorBody | null;
        showToast({ variant: "error", message: mapFeatureErrorMessage(json) });
        return;
      }

      if (!savedFeatureId) {
        const created = (await response.json()) as { id: number };
        setSavedFeatureId(created.id);
      }

      showToast({
        variant: "success",
        message: !wasActive
          ? "Feature attivata"
          : active
            ? "Feature aggiornata"
            : "Feature disattivata",
      });
      onSaved();
      if (wasActive) onClose();
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: "Errore durante il salvataggio della feature",
      });
    } finally {
      setSaving(false);
    }
  }, [
    campaignSlug,
    savedFeatureId,
    featureType,
    active,
    wasActive,
    talentsEnabled,
    deathXpRecoveryEnabled,
    deathXpRecoveryPercentage,
    onClose,
    onSaved,
    showToast,
  ]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      fullscreen={isMobile}
      title="Feature: Progressi"
      contentClassName="w-full md:w-[650px] gap-3"
      content={
        <>
          <Card className="flex-col items-start border-primary">
            <CheckButton
              readOnly={!savedFeatureId}
              disabled={saving}
              selected={active}
              icon="stars"
              label="Attiva la feature e la relativa sezione"
              onClick={() => setActive(!active)}
            />
            <Text size={0} className="m-3 mt-0">
              Gestisce come i personaggi progrediscono nel corso della campagna:
              talenti e recupero XP alla morte.
            </Text>
          </Card>

          {savedFeatureId && active && (
            <>
              <FieldSelect
                label="Modalità di progressione del personaggio"
                disabled={saving}
                value="xp"
                icon="stars"
                items={[
                  { id: "xp", label: "Punti XP", icon: "stars" },
                  {
                    id: "stats",
                    label: "Punti Statistica (Coming soon)",
                    icon: "quiz",
                    disabled: true,
                  },
                ]}
              />

              <Card className="flex-col items-stretch">
                <CheckButton
                  disabled={saving}
                  selected={talentsEnabled}
                  icon="talent"
                  label="Abilita talenti"
                  sublabel="i partecipanti possono apprendere talenti dalla propria scheda personaggio"
                  onClick={setTalentsEnabled}
                />
              </Card>

              <Card className="flex-col items-stretch">
                <CheckButton
                  disabled={saving}
                  selected={deathXpRecoveryEnabled}
                  icon="skull"
                  label="Abilita recupero XP alla morte"
                  sublabel="durante la creazione di un nuovo personaggio si può selezionare un proprio personaggio deceduto per recuperare parte degli XP"
                  onClick={setDeathXpRecoveryEnabled}
                />
                {deathXpRecoveryEnabled && (
                  <div className="p-3 pt-0">
                    <FieldText
                      disabled={saving}
                      label="Percentuale di XP disponibile recuperata dal successore"
                      labelMandatory
                      icon="percent"
                      inputType="number"
                      value={deathXpRecoveryPercentage}
                      onChange={setDeathXpRecoveryPercentage}
                    />
                  </div>
                )}
              </Card>
            </>
          )}
        </>
      }
      actionsLoading={saving}
      actions={
        <>
          <div className="flex-1" />
          <Btn label="ANNULLA" onClick={onClose} />
          <Btn
            color="var(--succ)"
            variant="bold"
            label={savedFeatureId ? "SALVA" : "ABILITA"}
            onClick={handleSubmit}
          />
        </>
      }
    />
  );
};

export default ModalFeatureProgress;
