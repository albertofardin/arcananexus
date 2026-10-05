"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import ModalDeleteCharacter from "./ModalDeleteCharacter";
import Btn from "@/components/_core/Btn";
import { useToast } from "@/components/_core/Toast";

export interface IBtnDeleteCharacter {
  characterId: number;
  characterName: string;
  campaignSlug: string;
  /** Dove andare dopo l'eliminazione. */
  redirectHref: string;
}

// Pulsante + modale di eliminazione dalla scheda personaggio. Da renderizzare
// solo per master/head_master (la route DELETE lo impone comunque).
const BtnDeleteCharacter = ({
  characterId,
  characterName,
  campaignSlug,
  redirectHref,
}: IBtnDeleteCharacter) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const handleConfirm = React.useCallback(async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/characters/${characterId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete character");
      await queryClient.invalidateQueries({
        queryKey: ["campaign-characters", campaignSlug],
      });
      await queryClient.invalidateQueries({
        queryKey: ["characters", campaignSlug],
      });
      showToast({ variant: "success", message: "Personaggio eliminato" });
      router.push(redirectHref as never);
      router.refresh();
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: "Errore durante l'eliminazione del personaggio",
      });
      setDeleting(false);
    }
  }, [characterId, campaignSlug, redirectHref, queryClient, router, showToast]);

  return (
    <>
      <Btn
        icon="delete"
        label="Elimina personaggio"
        color="var(--fail)"
        onClick={() => setOpen(true)}
      />
      <ModalDeleteCharacter
        character={open ? { name: characterName } : null}
        submitting={deleting}
        onClose={() => setOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
};

export default BtnDeleteCharacter;
