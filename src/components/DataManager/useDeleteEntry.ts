"use client";

import * as React from "react";
import { buildApiErrorMessage } from "./apiErrors";
import { useToast } from "@/components/_core/Toast";

interface UseDeleteEntryOptions {
  buildUrl: (id: number) => string;
  onDeleted: () => void;
  successMessage?: string;
  errorMessage?: string;
}

// Dettagli di un 409 "eliminazione bloccata" (T-027 dipendenti nel grafo
// requisiti, T-036 assegnazioni a un PG): ortogonali fra loro, esposti così
// come restituiti dall'API perché solo `ManagerDataCatalogs` (gestione avanzata,
// T-030 admin) li rende visibili — gli altri manager li ignorano.
export interface DeleteBlockedDetails {
  dependents?: { id: number; name: string }[];
  assignedCount?: number;
}

// Stato/flusso di eliminazione condiviso da `ManagerDataFiles`,
// `ManagerDataCatalogs` e `ManagerDataPages`: cambia solo l'URL della DELETE
// (documento vs voce di catalogo generica), non la UX di conferma. Il modal
// resta aperto su errore (solo un successo lo chiude) così un 409 bloccato
// resta visibile invece di sparire subito.
export function useDeleteEntry({
  buildUrl,
  onDeleted,
  successMessage = "Voce eliminata",
  errorMessage = "Errore durante l'eliminazione",
}: UseDeleteEntryOptions) {
  const { showToast } = useToast();
  const [deletingId, setDeletingId] = React.useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<number | null>(
    null
  );
  const [blocked, setBlocked] = React.useState<DeleteBlockedDetails | null>(
    null
  );

  const handleDelete = React.useCallback(async () => {
    if (pendingDeleteId === null) return;

    setDeletingId(pendingDeleteId);
    setBlocked(null);
    try {
      const response = await fetch(buildUrl(pendingDeleteId), {
        method: "DELETE",
      });

      if (!response.ok) {
        const json = await response.json().catch(() => null);
        showToast({
          variant: "error",
          message: buildApiErrorMessage(json, errorMessage),
        });
        const details = json?.details as DeleteBlockedDetails | undefined;
        if (details?.dependents || typeof details?.assignedCount === "number") {
          setBlocked(details);
        }
        return;
      }

      showToast({ variant: "success", message: successMessage });
      onDeleted();
      setPendingDeleteId(null);
    } catch (err) {
      console.error(err);
      showToast({ variant: "error", message: errorMessage });
    } finally {
      setDeletingId(null);
    }
  }, [
    buildUrl,
    errorMessage,
    onDeleted,
    pendingDeleteId,
    successMessage,
    showToast,
  ]);

  return {
    deletingId,
    pendingDeleteId,
    setPendingDeleteId,
    blocked,
    handleDelete,
  };
}
