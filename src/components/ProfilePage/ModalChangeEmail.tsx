"use client";

import * as React from "react";
import z from "zod";
import Modal from "@/components/_core/Modal";
import Btn from "@/components/_core/Btn";
import FieldText from "@/components/_core/FieldText";
import { useToast } from "@/components/_core/Toast";
import FieldPwd from "@/components/Login/FieldPwd";

interface IModalChangeEmail {
  open: boolean;
  currentEmail: string;
  onClose: () => void;
}

const emailSchema = z.string().email();

const ModalChangeEmail = ({
  open,
  currentEmail,
  onClose,
}: IModalChangeEmail) => {
  const { showToast } = useToast();
  const [newEmail, setNewEmail] = React.useState("");
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const reset = React.useCallback(() => {
    setNewEmail("");
    setCurrentPassword("");
  }, []);

  const handleClose = React.useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleConfirm = React.useCallback(async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/profile/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail, currentPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.error || "Errore durante il cambio email");

      // L'email non cambia subito: Better Auth manda un link di conferma
      // alla nuova casella, il cambio effettivo (e la verifica) avvengono
      // solo al click (vedi commento in src/app/api/profile/update/route.ts).
      showToast({
        variant: "info",
        message: `Ti abbiamo inviato un'email a ${newEmail}: clicca il link per confermare il cambio`,
        duration: 6000,
      });
      handleClose();
    } catch (err) {
      showToast({
        variant: "error",
        message:
          err instanceof Error ? err.message : "Errore durante il cambio email",
      });
    } finally {
      setSubmitting(false);
    }
  }, [newEmail, currentPassword, showToast, handleClose]);

  const canConfirm =
    emailSchema.safeParse(newEmail).success &&
    newEmail !== currentEmail &&
    !!currentPassword &&
    !submitting;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Cambia email"
      contentClassName="gap-3"
      content={
        <div className="flex w-[380px] max-w-full flex-col gap-3">
          <FieldText
            label="Nuova email"
            placeholder="nuova@email.com"
            icon="email"
            inputType="email"
            autoFocus
            value={newEmail}
            onChange={setNewEmail}
          />
          <FieldPwd
            autoComplete="current-password"
            value={currentPassword}
            label="Password attuale"
            onChange={setCurrentPassword}
          />
        </div>
      }
      actionsLoading={submitting}
      actions={
        <>
          <Btn label="ANNULLA" onClick={handleClose} />
          <Btn
            variant="bold"
            label="CONFERMA"
            disabled={!canConfirm}
            onClick={handleConfirm}
          />
        </>
      }
    />
  );
};

export default ModalChangeEmail;
