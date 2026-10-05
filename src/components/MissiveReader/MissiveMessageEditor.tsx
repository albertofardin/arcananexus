"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Btn from "@/components/_core/Btn";
import Text from "@/components/_core/Text";
import Modal from "@/components/_core/Modal";
import FieldRichText from "@/components/_core/FieldRichText";
import { useToast } from "@/components/_core/Toast";

export interface MissiveMessageEditorProps {
  campaignSlug: string;
  missiveId: number;
  description: string;
  // Calcolato server-side dalla page di dettaglio (T-0xx, "modifica
  // missiva"): mai dedotto qui — vero solo per il mittente reale di QUESTO
  // messaggio (radice o risposta), su un ramo diverso da Comunicazione/
  // "Campo libero"/"a nome del master", e solo finché il destinatario non
  // l'ha ancora letta. Nasconde semplicemente il pulsante "MODIFICA": il
  // vero gate resta comunque server-side in `PATCH .../missive/[id]`.
  canEdit: boolean;
}

// Editor inline del contenuto di un singolo messaggio (radice o risposta di
// thread, T-0xx "modifica missiva"): niente modale di conferma, si passa
// direttamente da sola lettura a editing con "MODIFICA", poi "ANNULLA"/
// "SALVA" — stesso principio già adottato in `DowntimeMasterEditor`. Usa un
// `fetch` proprio invece di `useApiAction`: un 409 (il destinatario ha letto
// la missiva DOPO che il mittente ha aperto l'editing, prima che salvasse —
// vedi `updateMissiveContentIfUnread`) deve aprire una modale dedicata
// invece del solito toast d'errore generico, che `useApiAction` non
// distingue da qualunque altro errore.
const MissiveMessageEditor = ({
  campaignSlug,
  missiveId,
  description,
  canEdit,
}: MissiveMessageEditorProps) => {
  const router = useRouter();
  const { showToast } = useToast();
  const [editing, setEditing] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [conflict, setConflict] = React.useState(false);
  const [nextDescription, setNextDescription] = React.useState(description);

  const handleEdit = React.useCallback(() => {
    setNextDescription(description);
    setEditing(true);
  }, [description]);

  const handleSave = React.useCallback(async () => {
    if (!nextDescription.trim()) return;

    setPending(true);
    try {
      const response = await fetch(
        `/api/campaigns/${campaignSlug}/missive/${missiveId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: nextDescription }),
        }
      );

      if (response.status === 409) {
        setConflict(true);
        return;
      }
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        showToast({
          variant: "error",
          message: json?.error ?? "Errore durante la modifica della missiva",
        });
        return;
      }

      showToast({ variant: "success", message: "Missiva modificata" });
      setEditing(false);
      router.refresh();
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: "Errore durante la modifica della missiva",
      });
    } finally {
      setPending(false);
    }
  }, [campaignSlug, missiveId, nextDescription, router, showToast]);

  const handleCloseConflict = React.useCallback(() => {
    setConflict(false);
    setEditing(false);
    router.refresh();
  }, [router]);

  return (
    <>
      {editing ? (
        <div className="flex flex-col gap-2">
          <FieldRichText
            value={nextDescription}
            onChange={setNextDescription}
            campaignSlug={campaignSlug}
          />
          <div className="flex justify-end gap-3">
            <Btn
              label="ANNULLA"
              disabled={pending}
              onClick={() => setEditing(false)}
            />
            <Btn
              variant="bold"
              color="var(--succ)"
              icon="check"
              label="SALVA"
              labelPosition
              disabled={pending || !nextDescription.trim()}
              onClick={handleSave}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <FieldRichText value={description} readOnly disabled />
          {canEdit && (
            <Btn
              className="self-end"
              icon="edit"
              label="MODIFICA"
              onClick={handleEdit}
            />
          )}
        </div>
      )}

      <Modal
        open={conflict}
        onClose={handleCloseConflict}
        title="Impossibile modificare"
        content={
          <Text children="Il destinatario ha già letto questa missiva nel frattempo: non è più possibile modificarla." />
        }
        actions={
          <Btn variant="bold" label="OK" onClick={handleCloseConflict} />
        }
      />
    </>
  );
};

export default MissiveMessageEditor;
