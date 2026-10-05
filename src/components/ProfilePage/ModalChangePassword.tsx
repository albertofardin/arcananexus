"use client";

import * as React from "react";
import Modal from "@/components/_core/Modal";
import Btn from "@/components/_core/Btn";
import { useToast } from "@/components/_core/Toast";
import FieldPwd from "@/components/Login/FieldPwd";
import FormChoosePassword from "@/components/Login/FormChoosePassword";

interface IModalChangePassword {
  open: boolean;
  onClose: () => void;
}

const ModalChangePassword = ({ open, onClose }: IModalChangePassword) => {
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const reset = React.useCallback(() => {
    setCurrentPassword("");
    setNewPassword("");
  }, []);

  const handleClose = React.useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleConfirm = React.useCallback(async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Errore durante il cambio password");

      showToast({
        variant: "success",
        message: "Password aggiornata con successo",
      });
      handleClose();
    } catch (err) {
      showToast({
        variant: "error",
        message:
          err instanceof Error
            ? err.message
            : "Errore durante il cambio password",
      });
    } finally {
      setSubmitting(false);
    }
  }, [currentPassword, newPassword, showToast, handleClose]);

  const canConfirm = !!currentPassword && !!newPassword && !submitting;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Cambia password"
      contentClassName="gap-3"
      content={
        <div className="flex w-[380px] max-w-full flex-col gap-3">
          <FieldPwd
            autoComplete="current-password"
            value={currentPassword}
            label="Password attuale"
            onChange={setCurrentPassword}
          />
          <FormChoosePassword disabled={submitting} onValid={setNewPassword} />
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

export default ModalChangePassword;
