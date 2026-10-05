"use client";

import * as React from "react";
import { mapFeatureErrorMessage, type FeatureApiErrorBody } from "./features";
import CheckButton from "./CheckButton";
import Text from "@/components/_core/Text";
import Btn from "@/components/_core/Btn";
import FieldText from "@/components/_core/FieldText";
import Modal from "@/components/_core/Modal";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/components/_core/Toast";
import type {
  FeatureTypeDto,
  FeatureWithTypeDto,
} from "@/lib/validations/feature";
import { missiveFeatureSchema } from "@/lib/features/handlers/missive.schema";
import Card from "@/components/_core/Card";
import Divider from "@/components/_core/Divider";
import FieldSelect from "@/components/_core/FieldSelect";
import type { CampaignGrantsResponse } from "@/lib/validations/grant";

interface ModalFeatureMissiveProps {
  open: boolean;
  onClose: () => void;
  campaignSlug: string;
  featureType: FeatureTypeDto | null;
  existingFeature: FeatureWithTypeDto | null;
  onSaved: () => void;
}

const ModalFeatureMissive = ({
  open,
  onClose,
  campaignSlug,
  featureType,
  existingFeature,
  onSaved,
}: ModalFeatureMissiveProps) => {
  const wasActive = !!existingFeature?.active;
  const { showToast } = useToast();
  const isMobile = useIsMobile();
  const [saving, setSaving] = React.useState(false);
  const [active, setActive] = React.useState(true);
  // Id della `Feature` salvata in questa sessione della modale: alla prima
  // abilitazione `existingFeature` (prop del parent) resta `null` finché
  // `onSaved` non fa refetch e il parent non ripassa `missiveTarget`, cosa
  // che qui non accade perché la modale resta aperta — senza questo stato
  // la sezione con gli altri parametri non comparirebbe mai dopo un POST.
  const [savedFeatureId, setSavedFeatureId] = React.useState<number | null>(
    existingFeature?.id ?? null
  );
  const [maxPerEvent, setMaxPerEvent] = React.useState("0");
  const [pngCountsAsDowntime, setPngCountsAsDowntime] = React.useState(false);
  const [canAnswer, setCanAnswer] = React.useState(false);
  const [canAnswerFree, setCanAnswerFree] = React.useState(false);
  const [canAnswerThread, setCanAnswerThread] = React.useState(false);
  const [maxThreadMessages, setMaxThreadMessages] = React.useState("50");
  const [fieldErrors, setFieldErrors] = React.useState<
    Record<string, string[]>
  >({});

  // Destinatari delle notifiche "missiva Campo libero inviata" (T-0xx,
  // pannello notifiche): stesso pattern di `ModalFeatureDowntime.tsx`
  // (`notifyUserIds`) — opzioni = utenti con `Grant.role` master/head_master,
  // riusa `GET .../grants` (già esistente per "Gestione Staff").
  const [notifyUserIds, setNotifyUserIds] = React.useState<string[]>([]);
  const [staffOptions, setStaffOptions] = React.useState<
    { id: string; name: string }[]
  >([]);

  const loadStaffOptions = React.useCallback(async () => {
    try {
      const response = await fetch(`/api/campaigns/${campaignSlug}/grants`);
      if (!response.ok) throw new Error("Errore nel caricamento");
      const json = (await response.json()) as CampaignGrantsResponse;
      const usersById = new Map(json.users.map(u => [u.id, u]));
      const options = json.assignments
        .filter(a => a.role === "master" || a.role === "head_master")
        .map(a => usersById.get(a.userId))
        .filter((u): u is { id: string; name: string; email: string } => !!u)
        .map(u => ({ id: u.id, name: u.name }));
      setStaffOptions(options);
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: "Errore durante il caricamento dello staff della campagna",
      });
    }
  }, [campaignSlug, showToast]);

  React.useEffect(() => {
    if (!open) return;
    const parsed = missiveFeatureSchema.safeParse(
      existingFeature?.featureData ?? {}
    );
    setActive(existingFeature ? existingFeature.active : true);
    setSavedFeatureId(existingFeature?.id ?? null);
    setMaxPerEvent(String(parsed.success ? parsed.data.maxPerEvent : 0));
    setPngCountsAsDowntime(
      parsed.success ? parsed.data.pngCountsAsDowntime : false
    );
    setCanAnswer(parsed.success ? parsed.data.canAnswer : false);
    setCanAnswerFree(parsed.success ? parsed.data.canAnswerFree : false);
    setCanAnswerThread(parsed.success ? parsed.data.canAnswerThread : false);
    setMaxThreadMessages(
      String(parsed.success ? parsed.data.maxThreadMessages : 50)
    );
    setNotifyUserIds(parsed.success ? parsed.data.notifyUserIds : []);
    loadStaffOptions();
    setFieldErrors({});
  }, [open, existingFeature, loadStaffOptions]);

  // Spegnere `canAnswer` deve spegnere anche i due flag figli lato UI:
  // altrimenti il submit fallirebbe contro il `.refine()` server-side di
  // `missiveFeatureSchema` (vedi `handlers/missive.ts`), che li richiede
  // entrambi `false` quando `canAnswer` è spenta.
  const handleCanAnswerChange = (value: boolean) => {
    setCanAnswer(value);
    if (!value) {
      setCanAnswerFree(false);
      setCanAnswerThread(false);
    }
  };

  const handleSubmit = React.useCallback(async () => {
    if (!featureType) return;

    const featureData = {
      maxPerEvent: Number(maxPerEvent.trim()) || 0,
      pngCountsAsDowntime,
      canAnswer,
      canAnswerFree: canAnswer && canAnswerFree,
      canAnswerThread: canAnswer && canAnswerThread,
      maxThreadMessages: Number(maxThreadMessages.trim()) || 50,
      notifyUserIds,
      // Gestito dal pannello progressione: preservato, non modificato qui.
      pointBonuses: missiveFeatureSchema.safeParse(
        existingFeature?.featureData ?? {}
      ).data?.pointBonuses,
    };

    setSaving(true);
    setFieldErrors({});
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
        if (
          json?.details &&
          typeof json.details === "object" &&
          "fieldErrors" in json.details
        ) {
          setFieldErrors(
            (json.details as { fieldErrors: Record<string, string[]> })
              .fieldErrors
          );
        }
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
    maxPerEvent,
    pngCountsAsDowntime,
    canAnswer,
    canAnswerFree,
    canAnswerThread,
    maxThreadMessages,
    notifyUserIds,
    existingFeature,
    onClose,
    onSaved,
    showToast,
  ]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      fullscreen={isMobile}
      title="Feature: Missive"
      contentClassName="w-full md:w-[650px] gap-3"
      content={
        <>
          <Card className="flex-col items-start border-primary">
            <CheckButton
              readOnly={!savedFeatureId}
              disabled={saving}
              selected={active}
              icon="mail"
              label="Attiva la feature e la relativa sezione"
              onClick={() => setActive(!active)}
            />
            <Text size={0} className="m-3 mt-0">
              Abilita la possibilità di poter scambiare messaggi tra i
              partecipanti della campagna.
              <br />
              I master possono mandare missive senza limiti come PNG, "Mittente
              nascosto" o "Comunicazione".
              <br />I giocatori possono mandare missive solo se hanno un PG
              attivo e se hanno punti missive disponibili.
            </Text>
          </Card>

          {savedFeatureId && active && (
            <>
              <div className="flex flex-col gap-1">
                <FieldText
                  disabled={saving}
                  label="Missive di base intra-evento per PG"
                  icon="hashtag"
                  inputType="number"
                  error={!!fieldErrors.maxPerEvent?.length}
                  value={maxPerEvent}
                  onChange={setMaxPerEvent}
                />
                {fieldErrors.maxPerEvent?.map(message => (
                  <Text
                    key={message}
                    size={0}
                    className="text-fail m-3 mt-0"
                    children={message}
                  />
                ))}
              </div>
              <FieldSelect
                label="Notifica queste persone quando viene inviata una missiva a Campo libero"
                icon="groups"
                disabled={saving}
                multiple
                value={notifyUserIds}
                onChange={value =>
                  setNotifyUserIds(
                    Array.isArray(value) ? value.map(String) : []
                  )
                }
                items={staffOptions.map(option => ({
                  id: option.id,
                  label: option.name,
                }))}
              />
              <Card className="flex-col items-stretch">
                <CheckButton
                  disabled={saving}
                  selected={pngCountsAsDowntime}
                  icon="downtime"
                  label="Missive a PNG scalano dal conteggio downtime invece che dal conteggio missive"
                  onClick={setPngCountsAsDowntime}
                />
              </Card>
              <Card className="flex-col items-stretch">
                <CheckButton
                  disabled={saving}
                  selected={canAnswer}
                  icon="link_back"
                  label="Abilita le risposte alle missive"
                  sublabel="il mittente può comunque disattivarla per la singola missiva"
                  onClick={handleCanAnswerChange}
                />
                <Divider />
                <CheckButton
                  disabled={saving || !canAnswer}
                  selected={canAnswerFree}
                  icon="message_incoming"
                  label="Le risposte sono gratuite (non consumano punti missiva o downtime)"
                  onClick={setCanAnswerFree}
                />
                <CheckButton
                  disabled={saving || !canAnswer}
                  selected={canAnswerThread}
                  icon="message_multiple"
                  label="Lo scambio di risposte può continuare oltre la singola risposta (thread di messaggi)"
                  onClick={setCanAnswerThread}
                />
                {canAnswerThread && (
                  <div className="flex flex-col gap-2 m-3 mt-0">
                    <FieldText
                      disabled={saving}
                      label="Numero massimo di messaggi nel thread"
                      icon="hashtag"
                      inputType="number"
                      error={!!fieldErrors.maxThreadMessages?.length}
                      value={maxThreadMessages}
                      onChange={setMaxThreadMessages}
                    />
                    {fieldErrors.maxThreadMessages?.map(message => (
                      <Text key={message} size={0} children={message} />
                    ))}
                    <Text size={0}>
                      Il conteggio include il messaggio iniziale. Con un numero
                      pari, mittente e destinatario si scambiano lo stesso
                      numero di invii a testa (es. 4 = 2 a testa, 6 = 3 a testa,
                      10 = 5 a testa). Con un numero dispari, chi ha aperto il
                      thread ne scrive uno in più. Il valore di default (50) è
                      alto apposta: serve solo da tetto di sicurezza e non
                      limita quasi mai uno scambio normale. Per un limite più
                      realistico, si consiglia di impostare 4 o 6.
                    </Text>
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

export default ModalFeatureMissive;
