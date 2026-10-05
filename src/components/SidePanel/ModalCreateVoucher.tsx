"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import Btn from "@/components/_core/Btn";
import BtnCheckbox from "@/components/_core/BtnCheckbox";
import FieldSelect from "@/components/_core/FieldSelect";
import FieldText from "@/components/_core/FieldText";
import Modal from "@/components/_core/Modal";
import Text from "@/components/_core/Text";
import { useToast } from "@/components/_core/Toast";
import BadgeRole from "@/components/BadgeRole";
import { MAX_VOUCHER_AMOUNT } from "@/lib/validations/voucher";

export interface IModalCreateVoucher {
  open: boolean;
  onClose: () => void;
}

interface VoucherMembers {
  year: number;
  /** Tesserati dell'anno corrente, tra cui scegliere il destinatario. */
  members: { id: string; label: string; image: string | null }[];
}

const fetchVoucherMembers = async (): Promise<VoucherMembers> => {
  const res = await fetch("/api/vouchers");
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? "Errore di caricamento");
  return json;
};

/** "Crea Buono" (solo direttivo): accredita un importo sul saldo buoni di un tesserato. */
const ModalCreateVoucher = ({ open, onClose }: IModalCreateVoucher) => {
  const { showToast } = useToast();
  const { data, error } = useQuery({
    queryKey: ["vouchers", "members"] as const,
    queryFn: fetchVoucherMembers,
    enabled: open,
    retry: false,
  });
  const year = data?.year ?? new Date().getFullYear();
  const members = data?.members ?? [];
  const [userId, setUserId] = React.useState<string>();
  const [amount, setAmount] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const value = Number(amount.replace(",", "."));
  const validAmount =
    value > 0 &&
    value <= MAX_VOUCHER_AMOUNT &&
    /^\d+([.,]\d{1,2})?$/.test(amount);
  const canConfirm = !!userId && validAmount && confirmed && !submitting;

  const close = () => {
    onClose();
    setUserId(undefined);
    setAmount("");
    setConfirmed(false);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const response = await fetch("/api/vouchers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, amount: value }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error);
      showToast({ variant: "success", message: "Buono creato" });
      close();
    } catch (error) {
      showToast({
        variant: "error",
        message:
          error instanceof Error && error.message
            ? error.message
            : "Errore durante la creazione del buono",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Crea Buono"
      titleChildren={<BadgeRole type="onlyDirettivo" />}
      content={
        <div className="flex w-[440px] max-w-full flex-col gap-4">
          {error && <Text className="text-red-600" children={error.message} />}
          <Text
            children={`Il buono è un credito in euro che si aggiunge al saldo buoni del tesserato: verrà scalato automaticamente dalla quota delle sue prossime iscrizioni agli eventi. Il saldo vale fino alla scadenza della tessera ${year} e si azzera con il rinnovo della tessera annuale.`}
          />
          <FieldSelect
            label="Tesserato"
            labelMandatory
            placeholder={`Cerca tra i tesserati ${year}`}
            items={members.map(member => ({
              id: member.id,
              label: member.label,
              avatar: member.image ?? undefined,
              avatarText: member.label,
            }))}
            value={userId}
            onChange={id => setUserId(id as string)}
          />
          <FieldText
            label="Valore del buono (€)"
            labelMandatory
            inputType="number"
            placeholder="10"
            value={amount}
            onChange={setAmount}
          />
          <BtnCheckbox
            selected={confirmed}
            onClick={setConfirmed}
            label="Confermo di voler accreditare questo buono: il tesserato verrà avvisato via email e con una notifica in app."
          />
        </div>
      }
      actionsLoading={submitting}
      actions={
        <>
          <Btn label="ANNULLA" onClick={close} />
          <Btn
            variant="bold"
            label="CONFERMA"
            disabled={!canConfirm}
            onClick={submit}
          />
        </>
      }
    />
  );
};

export default ModalCreateVoucher;
