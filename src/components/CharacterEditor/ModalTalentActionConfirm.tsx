"use client";

import BadgeRole from "@/components/BadgeRole";
import Btn from "@/components/_core/Btn";
import Modal from "@/components/_core/Modal";
import Text from "@/components/_core/Text";

type ModalTalentActionConfirmVariant = "grant" | "remove";

const VARIANT_CONFIG: Record<
  ModalTalentActionConfirmVariant,
  {
    title: string;
    titleChildren?: React.ReactNode;
    content: (talentName: string) => React.ReactNode;
    confirmLabel: string;
    confirmColor: string;
  }
> = {
  grant: {
    title: "Aggiungi talento",
    titleChildren: <BadgeRole type="onlyMaster" />,
    // A costo zero: a differenza della bozza standard (batch al "Salva"),
    // questa è un'azione immediata e fuori bozza che bypassa requisiti e
    // saldo XP, quindi merita un passaggio di conferma esplicito invece del
    // semplice click-e-via del toggle in bozza.
    content: talentName => (
      <Text>
        «{talentName}» verrà assegnato subito al personaggio, bypassando
        requisiti e saldo XP.
        <br />
        Comparirà nella cronologia delle transizioni come acquisito a 0 XP.
      </Text>
    ),
    confirmLabel: "AGGIUNGI",
    confirmColor: "var(--succ)",
  },
  remove: {
    title: "Rimuovi talento",
    titleChildren: <BadgeRole type="onlyMaster" />,
    content: talentName => (
      <Text>
        «{talentName}» verrà tolto dalla scheda del personaggio.
        <br />I punti XP già speso non viene rimborsato e la rimozione resta
        comunque in cronologia a 0 XP.
      </Text>
    ),
    confirmLabel: "RIMUOVI",
    confirmColor: "var(--fail)",
  },
};

interface IModalTalentActionConfirm {
  variant: ModalTalentActionConfirmVariant;
  open: boolean;
  talentName: string;
  submitting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const ModalTalentActionConfirm = ({
  variant,
  open,
  talentName,
  submitting = false,
  onClose,
  onConfirm,
}: IModalTalentActionConfirm) => {
  const config = VARIANT_CONFIG[variant];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={config.title}
      titleChildren={config.titleChildren}
      content={config.content(talentName)}
      actionsLoading={submitting}
      actions={
        <>
          <Btn label="ANNULLA" onClick={onClose} />
          <Btn
            variant="bold"
            label={config.confirmLabel}
            color={config.confirmColor}
            onClick={onConfirm}
          />
        </>
      }
    />
  );
};

export default ModalTalentActionConfirm;
