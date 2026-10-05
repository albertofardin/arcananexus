"use client";

import * as React from "react";
import Btn from "@/components/_core/Btn";
import { useToast } from "@/components/_core/Toast";
import type { FeatureWithTypeDto } from "@/lib/validations/feature";

interface ApiErrorBody {
  error?: string;
}

export interface IFeatureToggleButton {
  campaignSlug: string;
  feature: FeatureWithTypeDto;
  pausedLabel?: string;
  resumedLabel?: string;
  pausedMessage: string;
  resumedMessage: string;
  onChanged: () => void;
}

// Solo il pulsante di azione (T-0xx): stato, badge e spiegazione della
// pausa vivono ora nel pannello di stato di PausableFeatureCard, che è
// l'unico chiamante — qui resta solo la chiamata PATCH e il relativo toast.
const FeatureToggleButton = ({
  campaignSlug,
  feature,
  pausedLabel = "Sospendi",
  resumedLabel = "Riprendi",
  pausedMessage,
  resumedMessage,
  onChanged,
}: IFeatureToggleButton) => {
  const { showToast } = useToast();
  const [submitting, setSubmitting] = React.useState(false);

  const handleToggle = async () => {
    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/campaigns/${campaignSlug}/features/${feature.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paused: !feature.paused }),
        }
      );
      if (!response.ok) {
        const json = (await response
          .json()
          .catch(() => null)) as ApiErrorBody | null;
        showToast({
          variant: "error",
          message: json?.error ?? "Errore durante l'aggiornamento",
        });
        return;
      }
      showToast({
        variant: "success",
        message: feature.paused ? resumedMessage : pausedMessage,
      });
      onChanged();
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: "Errore durante l'aggiornamento",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Btn
      variant="bold"
      icon={feature.paused ? "play_circle" : "pause_circle"}
      label={feature.paused ? resumedLabel : pausedLabel}
      color={feature.paused ? "var(--succ)" : "var(--fail)"}
      disabled={submitting}
      onClick={handleToggle}
    />
  );
};

export default FeatureToggleButton;
