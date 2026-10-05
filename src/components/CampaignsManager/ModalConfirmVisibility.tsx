"use client";

import Btn from "@/components/_core/Btn";
import Modal from "@/components/_core/Modal";
import Text from "@/components/_core/Text";

interface IModalConfirmVisibility {
  open: boolean;
  campaignName: string;
  // Visibilità che la campagna avrà DOPO la conferma (non quella attuale).
  nextVisibility: boolean;
  submitting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

// Conferma per il toggle di visibilità campagna (T-049): la visibilità
// governa solo se la campagna compare nelle liste (home, sidebar, gestione
// ruoli) — non è un controllo di accesso alla campagna in sé, chi conosce già
// l'URL diretto può comunque raggiungerla. Il messaggio va tenuto coerente
// con questo, per non promettere una protezione che la feature non offre.
const ModalConfirmVisibility = ({
  open,
  campaignName,
  nextVisibility,
  submitting = false,
  onClose,
  onConfirm,
}: IModalConfirmVisibility) => (
  <Modal
    open={open}
    onClose={onClose}
    title={
      nextVisibility
        ? "Rendi pubblica la campagna"
        : "Rendi privata la campagna"
    }
    content={
      <div className="flex flex-col gap-2">
        <Text
          children={
            nextVisibility ? (
              <>
                {`«${campaignName}» tornerà visibile a chiunque: comparirà nella home, nello switcher campagne e nella lista di Gestione Ruoli per tutti gli utenti, non solo per Sviluppo Web e per lo staff della campagna.`}
              </>
            ) : (
              <>
                {`«${campaignName}» smetterà di comparire nella home, nello switcher campagne e nella lista di Gestione Ruoli per chiunque non sia Sviluppo Web o staff della campagna (headmaster, master, supporter).`}
              </>
            )
          }
        />
        {!nextVisibility && (
          <Text
            size={0}
            className="text-muted-fg"
            children="Attenzione: la campagna resta comunque raggiungibile da chi conosce già l'URL diretto — la visibilità nasconde solo dalle liste, non è un controllo di accesso."
          />
        )}
      </div>
    }
    actionsLoading={submitting}
    actions={
      <>
        <Btn label="ANNULLA" onClick={onClose} />
        <Btn
          variant="bold"
          label={nextVisibility ? "RENDI PUBBLICA" : "RENDI PRIVATA"}
          onClick={onConfirm}
        />
      </>
    }
  />
);

export default ModalConfirmVisibility;
