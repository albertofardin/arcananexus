"use client";

import * as React from "react";
import CheckButton from "./CheckButton";
import Text from "@/components/_core/Text";
import Btn from "@/components/_core/Btn";
import FieldText from "@/components/_core/FieldText";
import Modal from "@/components/_core/Modal";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/components/_core/Toast";
import { cn } from "@/lib/utils";
import Card from "@/components/_core/Card";
import Divider from "@/components/_core/Divider";
import FieldSelect from "@/components/_core/FieldSelect";
import type { FeatureWithTypeDto } from "@/lib/validations/feature";
import { downtimeFeatureSchema } from "@/lib/features/handlers/downtime";
import type { CampaignGrantsResponse } from "@/lib/validations/grant";

const ROW_HEIGHT = "h-[44px] min-h-[44px]";

interface ApiErrorBody {
  error?: string;
}

interface ModalFeatureDowntimeProps {
  open: boolean;
  onClose: () => void;
  campaignSlug: string;
  existingFeature: FeatureWithTypeDto | null;
  onSaved: () => void;
}

const ModalFeatureDowntime = ({
  open,
  onClose,
  campaignSlug,
  existingFeature,
  onSaved,
}: ModalFeatureDowntimeProps) => {
  const wasActive = !!existingFeature?.active;
  const { showToast } = useToast();
  const isMobile = useIsMobile();

  const [active, setActive] = React.useState(true);
  const [maxPointsInput, setMaxPointsInput] = React.useState("0");
  const [saving, setSaving] = React.useState(false);
  // Alla prima abilitazione `existingFeature` (prop del parent) resta `null`
  // finché `onSaved` non fa refetch e il parent non ripassa `downtimeTarget`,
  // cosa che qui non accade perché la modale resta aperta — senza questo
  // stato la sezione con gli altri parametri non comparirebbe mai dopo il
  // primo salvataggio.
  const [hasSaved, setHasSaved] = React.useState(!!existingFeature);

  // Destinatari delle notifiche "azione downtime dichiarata" (T-0xx, pannello
  // notifiche): un'UNICA lista per l'intera campagna, opzioni = utenti con
  // `Grant.role` master/head_master — riusa `GET .../grants` (già esistente
  // per "Gestione Staff"), nessuna route nuova necessaria solo per questo.
  const [notifyUserIds, setNotifyUserIds] = React.useState<string[]>([]);
  const [staffOptions, setStaffOptions] = React.useState<
    { id: string; name: string }[]
  >([]);

  // Categorie downtime (T-0xx, fix catalogo globale): un semplice elenco di
  // stringhe dentro `featureData.categories`, non più una `FeatureType`/
  // `Feature` dedicata per categoria — niente più attiva/disattiva o rename
  // "storico-safe" per la singola categoria, solo l'intera feature ha un
  // on/off (decisione esplicita: non interessa preservare lo storico di una
  // categoria rinominata/rimossa).
  const [categories, setCategories] = React.useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = React.useState("");

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
    const parsed = downtimeFeatureSchema.safeParse(
      existingFeature?.featureData ?? {}
    );
    setActive(existingFeature ? existingFeature.active : true);
    setHasSaved(!!existingFeature);
    setMaxPointsInput(String(parsed.success ? parsed.data.maxPoints : 0));
    setNotifyUserIds(parsed.success ? parsed.data.notifyUserIds : []);
    setCategories(parsed.success ? parsed.data.categories : []);
    setNewCategoryName("");
    loadStaffOptions();
  }, [open, existingFeature, loadStaffOptions]);

  const handleSubmit = React.useCallback(async () => {
    const parsedMaxPoints = Number(maxPointsInput.trim());
    const maxPoints =
      Number.isInteger(parsedMaxPoints) && parsedMaxPoints >= 0
        ? parsedMaxPoints
        : 0;

    setSaving(true);
    try {
      const response = await fetch(
        `/api/campaigns/${campaignSlug}/downtime-settings`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            active,
            maxPoints,
            notifyUserIds,
            categories,
          }),
        }
      );
      if (!response.ok) {
        const json = (await response
          .json()
          .catch(() => null)) as ApiErrorBody | null;
        showToast({
          variant: "error",
          message: json?.error ?? "Errore durante il salvataggio",
        });
        return;
      }

      setHasSaved(true);
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
        message: "Errore durante il salvataggio",
      });
    } finally {
      setSaving(false);
    }
  }, [
    campaignSlug,
    active,
    wasActive,
    maxPointsInput,
    notifyUserIds,
    categories,
    onClose,
    onSaved,
    showToast,
  ]);

  const handleAddCategory = React.useCallback(() => {
    const nome = newCategoryName.trim();
    if (!nome || categories.includes(nome)) return;
    setCategories(prev => [...prev, nome]);
    setNewCategoryName("");
  }, [newCategoryName, categories]);

  const handleRemoveCategory = React.useCallback((nome: string) => {
    setCategories(prev => prev.filter(c => c !== nome));
  }, []);

  return (
    <Modal
      open={open}
      onClose={onClose}
      fullscreen={isMobile}
      title="Feature: Downtime"
      contentClassName="w-full md:w-[650px] gap-3"
      content={
        <>
          <Card className="flex-col items-start border-primary">
            <CheckButton
              readOnly={!hasSaved}
              disabled={saving}
              selected={active}
              icon="downtime"
              label="Attiva la feature e la relativa sezione"
              onClick={() => setActive(!active)}
            />
            <Text size={0} className="m-3 mt-0">
              Abilita la possibilità ai partecipanti della campagna di
              dichiarare azioni downtime tra un evento e l'altro.
              <br />I giocatori possono inviare delle azioni downtime se hanno
              un PG attivo e se hanno punti downtime disponibili. I master
              possono leggere le azioni downtime dei giocatori e approvarle,
              rifiutarle e rispondere.
            </Text>
          </Card>
          {hasSaved && active && (
            <>
              <FieldText
                label="Downtime di base intra-evento per PG"
                labelMandatory
                icon="hashtag"
                inputType="number"
                disabled={saving}
                value={maxPointsInput}
                onChange={setMaxPointsInput}
              />
              <FieldSelect
                label="Notifica queste persone quando viene dichiarata un'azione downtime"
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
              <Text
                size={0}
                className="text-muted-fg ml-1.5 -mb-2"
                children="Categorie disponibili per la dichiarazione delle azioni downtime"
              />
              <Card className="flex flex-col items-stretch">
                <div className={cn("flex items-center p-2 gap-1")}>
                  <FieldText
                    icon="edit"
                    className="flex-1"
                    placeholder="Aggiungi categoria..."
                    disabled={saving}
                    value={newCategoryName}
                    onChange={setNewCategoryName}
                  />
                  <Btn
                    variant="bold"
                    icon="add"
                    disabled={saving || !newCategoryName.trim()}
                    onClick={handleAddCategory}
                  />
                </div>
                <Divider />
                <div className="flex flex-col items-stretch p-2">
                  {categories.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-1 rounded px-3 py-6 text-center">
                      <Text
                        className="text-muted-fg"
                        children="Nessuna categoria disponibile."
                      />
                    </div>
                  ) : (
                    categories.map(nome => (
                      <React.Fragment key={nome}>
                        <div
                          className={cn(
                            "flex w-full items-center gap-2 p-2",
                            ROW_HEIGHT,
                            "rounded hover:bg-accent"
                          )}
                        >
                          <Text className="flex-1 ml-1" children={nome} />
                          <Btn
                            small
                            icon="delete"
                            disabled={saving}
                            tooltip="Rimuovi categoria"
                            onClick={() => handleRemoveCategory(nome)}
                          />
                        </div>
                        <Divider className="last:hidden mx-2" />
                      </React.Fragment>
                    ))
                  )}
                </div>
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
            label={hasSaved ? "SALVA" : "ABILITA"}
            onClick={handleSubmit}
          />
        </>
      }
    />
  );
};

export default ModalFeatureDowntime;
