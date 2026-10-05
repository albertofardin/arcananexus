"use client";

import Portal from "../_core/Portal";
import Text from "../_core/Text";
import Icon from "../_core/Icon";
import Btn from "../_core/Btn";
import { cn } from "@/lib/utils";

const COLOR = "var(--info)";

export interface ISaveBar {
  /** Ci sono modifiche non salvate: la barra è visibile */
  dirty: boolean;
  /** Salvataggio in corso */
  saving: boolean;
  /** Salvataggio appena concluso: la barra mostra la conferma verde */
  saved: boolean;
  /** Testo mostrato a sinistra, personalizzabile per casi d'uso diversi da un salvataggio */
  message?: string;
  /** Etichetta del bottone principale, es. "Invia" per un form di creazione */
  saveLabel?: string;
  /** Etichetta del bottone principale mentre `saving` è true */
  savingLabel?: string;
  onSave: () => void;
  onDiscard: () => void;
  icon?: string;
}

const SaveBar = ({
  dirty,
  saving,
  onSave,
  onDiscard,
  message = "Modifiche non salvate",
  saveLabel = "Salva",
  savingLabel = "Salvataggio…",
  icon = "info",
}: ISaveBar) => {
  return (
    <Portal>
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4",
          "transition-all duration-300 ease-in-out",
          dirty ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        )}
      >
        <div
          className={cn(
            "flex max-w-[calc(100vw-2rem)] min-w-[min(380px,100%)] items-center gap-3 rounded-xl py-2 pl-4 pr-2",
            "shadow-[0_8px_30px_rgba(0,0,0,0.35)] transition-colors duration-300 border",
            dirty ? "pointer-events-auto" : "pointer-events-none"
          )}
          style={{
            borderColor: COLOR,
            backgroundColor: `color-mix(in srgb, ${COLOR} 10%, var(--bg))`,
          }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <Icon style={{ color: COLOR }} children={icon} />
            <Text size={2} ellipsis children={message} />
          </div>
          <div className="flex-1" />
          <div className="flex shrink-0 gap-2">
            {!saving && (
              <Btn
                variant="light"
                label="Annulla"
                color={COLOR}
                className="min-w-[85px] text-center"
                onClick={onDiscard}
              />
            )}
            <Btn
              variant="bold"
              label={saving ? savingLabel : saveLabel}
              color={COLOR}
              className="min-w-[85px] text-center"
              onClick={onSave}
              disabled={saving}
            />
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default SaveBar;
