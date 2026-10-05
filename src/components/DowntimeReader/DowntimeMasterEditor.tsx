"use client";

import * as React from "react";
import Card from "@/components/_core/Card";
import Text from "@/components/_core/Text";
import Btn from "@/components/_core/Btn";
import Badge from "@/components/_core/Badge";
import FieldSelect from "@/components/_core/FieldSelect";
import FieldRichText from "@/components/_core/FieldRichText";
import BadgeRole from "@/components/BadgeRole";
import { useApiAction } from "@/hooks/useApiAction";
import {
  DOWNTIME_STATUSES,
  DOWNTIME_STATUS_CONFIG,
  type DowntimeStatus,
} from "@/lib/downtime/status";

export interface DowntimeMasterEditorProps {
  campaignSlug: string;
  downtimeId: number;
  status: DowntimeStatus;
  response: string | null;
  masterNote: string | null;
}

// Stessa label/icona/colore di `DOWNTIME_STATUS_CONFIG` (fonte di verità
// unica) — mai duplicate qui.
const STATUS_ITEMS = DOWNTIME_STATUSES.map(status => ({
  id: status,
  color: DOWNTIME_STATUS_CONFIG[status].color,
  label: DOWNTIME_STATUS_CONFIG[status].label,
  labelStyle: { color: DOWNTIME_STATUS_CONFIG[status].color },
  icon: DOWNTIME_STATUS_CONFIG[status].icon,
  iconStyle: { color: DOWNTIME_STATUS_CONFIG[status].color },
}));

// Pannello master per gestire una downtime (T-0xx): sostituisce la vecchia
// coppia `DowntimeStatusControl` (solo lo stato, in header) +
// `ModalUpdateDowntimeStatus` (conferma in una modale). Parte SEMPRE in
// sola lettura (`editing = false`): entrare in modifica è un'azione
// esplicita ("MODIFICA"), per evitare di alterare per sbaglio testo già
// salvato solo passandoci sopra. Lo stato locale (`nextStatus`/...) viene
// (ri)sincronizzato dalle prop SOLO al momento di entrare in editing
// (`handleEdit`), mai in automatico: dopo un salvataggio le prop
// aggiornano (via `router.refresh()`) mentre il componente è già tornato
// in sola lettura, quindi non c'è alcun bisogno di un `useEffect` di sync.
// Un giocatore non vede mai questo componente: `DowntimeReader.tsx`
// renderizza invece un `Badge` read-only in header e, se presente, la Card
// di sola risposta.
const DowntimeMasterEditor = ({
  campaignSlug,
  downtimeId,
  status,
  response,
  masterNote,
}: DowntimeMasterEditorProps) => {
  const { pending, run } = useApiAction();
  const [editing, setEditing] = React.useState(false);
  const [nextStatus, setNextStatus] = React.useState(status);
  const [nextResponse, setNextResponse] = React.useState(response ?? "");
  const [nextMasterNote, setNextMasterNote] = React.useState(masterNote ?? "");

  const handleEdit = React.useCallback(() => {
    setNextStatus(status);
    setNextResponse(response ?? "");
    setNextMasterNote(masterNote ?? "");
    setEditing(true);
  }, [status, response, masterNote]);

  const handleSave = React.useCallback(() => {
    return run(
      `/api/campaigns/${campaignSlug}/downtime/${downtimeId}/status`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          response: nextResponse,
          masterNote: nextMasterNote,
        }),
      },
      {
        errorMessage: "Errore durante l'aggiornamento della downtime",
        successMessage: "Downtime aggiornata",
        refresh: true,
        onSuccess: () => setEditing(false),
      }
    );
  }, [campaignSlug, downtimeId, nextStatus, nextResponse, nextMasterNote, run]);

  const statusConfig = DOWNTIME_STATUS_CONFIG[status];

  return (
    <Card className="flex-col items-stretch gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Text weight="bolder" children="Gestione Downtime" />
        <BadgeRole type="onlyMaster" />
        <div className="flex-1" />
        {editing ? (
          <FieldSelect
            className="w-[220px] max-w-full"
            style={{ borderColor: DOWNTIME_STATUS_CONFIG[nextStatus].color }}
            value={nextStatus}
            icon={DOWNTIME_STATUS_CONFIG[nextStatus].icon}
            iconStyle={{ color: DOWNTIME_STATUS_CONFIG[nextStatus].color }}
            items={STATUS_ITEMS}
            onChange={value => setNextStatus(value as DowntimeStatus)}
          />
        ) : (
          <Badge
            className="self-start"
            color={statusConfig.color}
            icon={statusConfig.icon}
            label={statusConfig.label}
          />
        )}
      </div>

      {editing ? (
        <>
          <FieldRichText
            labelIcon="warning"
            label="Nota riservata (opzionale, visibile solo ai master)"
            placeholder="Scrivi una nota visibile solo allo staff..."
            value={nextMasterNote}
            onChange={setNextMasterNote}
            campaignSlug={campaignSlug}
          />
          <FieldRichText
            label="Risposta (opzionale, visibile al giocatore)"
            placeholder="Scrivi una risposta per il giocatore..."
            value={nextResponse}
            onChange={setNextResponse}
            campaignSlug={campaignSlug}
          />
        </>
      ) : (
        <>
          {!!masterNote && (
            <FieldRichText
              labelIcon="warning"
              label="Nota riservata"
              readOnly
              value={masterNote}
              disabled
            />
          )}
          <FieldRichText
            label="Risposta"
            readOnly
            value={response ?? "- Nessuna risposta -"}
            disabled
          />
        </>
      )}
      <div className="flex justify-end gap-3">
        {editing ? (
          <>
            {" "}
            <Btn
              label="ANNULLA"
              disabled={pending}
              onClick={() => setEditing(false)}
            />
            <Btn
              className="text-center w-[200px]"
              variant="bold"
              color="var(--succ)"
              icon="check"
              label="SALVA"
              labelPosition
              disabled={pending}
              onClick={handleSave}
            />
          </>
        ) : (
          <Btn icon="edit" label="MODIFICA" onClick={handleEdit} />
        )}
      </div>
    </Card>
  );
};

export default DowntimeMasterEditor;
