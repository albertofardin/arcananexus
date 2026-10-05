"use client";

import * as React from "react";
import Text from "@/components/_core/Text";
import Btn from "@/components/_core/Btn";
import Modal from "@/components/_core/Modal";
import { useToast } from "@/components/_core/Toast";

interface ApiErrorBody {
  error?: string;
}

interface ResetPointsResult {
  updatedCount: number;
  value: number;
}

export type ResetTarget = "downtime" | "missive";

const RESET_CONFIG: Record<
  ResetTarget,
  {
    icon: string;
    title: string;
    label: string;
    endpoint: string;
  }
> = {
  downtime: {
    icon: "downtime",
    title: "Reset DOWNTIME",
    label: "Punti Downtime",
    endpoint: "downtime-reset",
  },
  missive: {
    icon: "mail",
    title: "Reset MISSIVE",
    label: "Punti Missive",
    endpoint: "missive-reset",
  },
};

// Un solo pulsante (+ modale di conferma) per il `target` richiesto (T-0xx):
// prima renderizzava entrambi insieme (era l'unica azione dell'header
// admin/), ora ogni card di admin/progress (Missive, Downtime) ne monta uno
// scoperto sul proprio dominio, così il pulsante vive accanto allo
// stop/riprendi dello stesso dominio invece che isolato in alto pagina.
const ResetPointsButtons = ({
  campaignSlug,
  target,
}: {
  campaignSlug: string;
  target: ResetTarget;
}) => {
  const { showToast } = useToast();
  const [confirming, setConfirming] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);

  const { title, label, endpoint } = RESET_CONFIG[target];

  const handleConfirm = React.useCallback(async () => {
    setResetting(true);
    try {
      const response = await fetch(
        `/api/campaigns/${campaignSlug}/characters/${endpoint}`,
        { method: "POST" }
      );
      if (!response.ok) {
        const json = (await response
          .json()
          .catch(() => null)) as ApiErrorBody | null;
        showToast({
          variant: "error",
          message: json?.error ?? "Errore durante il reset dei punti",
        });
        return;
      }
      const json = (await response.json()) as ResetPointsResult;
      showToast({
        variant: "success",
        message: `Reimpostati ${label} a ${json.updatedCount} personaggi`,
      });
      setConfirming(false);
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: "Errore durante il reset dei punti",
      });
    } finally {
      setResetting(false);
    }
  }, [campaignSlug, endpoint, label, showToast]);

  return (
    <>
      <Btn
        variant="bold"
        icon="refresh"
        label="Reset punti"
        onClick={() => setConfirming(true)}
      />

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={title}
        content={
          <Text>
            Sei sicuro di voler resettare i{" "}
            <span style={{ fontWeight: "bolder" }}>{label}</span> di tutti i
            personaggi attivi?
          </Text>
        }
        actionsLoading={resetting}
        actions={
          <>
            <Btn label="ANNULLA" onClick={() => setConfirming(false)} />
            <Btn
              variant="bold"
              label="RESETTA"
              color="var(--fail)"
              onClick={handleConfirm}
            />
          </>
        }
      />
    </>
  );
};

export default ResetPointsButtons;
