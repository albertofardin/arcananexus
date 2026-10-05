"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import Icon from "@/components/_core/Icon";
import Text from "@/components/_core/Text";
import Btn from "@/components/_core/Btn";
import { useToast } from "@/components/_core/Toast";
import {
  useQueryImpersonationStatus,
  endImpersonation,
} from "@/lib/queries/impersonation";

// Testo scuro fisso: la barra è sempre su sfondo ambrato (--warn), che
// resta chiaro/medio in ogni tema, quindi il contrasto va garantito qui
// invece di affidarsi ai colori di tema (text-fg potrebbe essere
// quasi bianco in tema scuro).
const INK = "#1a1200";

/**
 * Barra sempre visibile, montata nel layout della dashboard (vedi
 * `(dashboard)/layout.tsx`), che segnala un'impersonation attiva — un
 * super-admin che sta operando come un altro utente (vedi
 * `src/lib/impersonation.ts`). Fa polling di `GET /api/admin/impersonate/status`
 * e non renderizza nulla finché `isImpersonating` non è true.
 */
const ImpersonationToolbar = () => {
  const { data } = useQueryImpersonationStatus();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [ending, setEnding] = React.useState(false);

  const handleEnd = React.useCallback(async () => {
    setEnding(true);
    try {
      await endImpersonation();
      // La sessione attiva torna quella dell'admin: la cache react-query è
      // legata all'identità precedente, va svuotata perché le query attive
      // (capabilities, elenco utenti, ...) si ricarichino coerenti.
      queryClient.clear();
      router.refresh();
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: "Impossibile uscire dall'impersonazione. Riprova.",
      });
    } finally {
      setEnding(false);
    }
  }, [queryClient, router, showToast]);

  if (!data?.isImpersonating) return null;

  const { activeUser } = data;

  return (
    <div
      role="status"
      className="flex flex-shrink-0 flex-wrap items-center gap-3 px-4 py-2"
      style={{ backgroundColor: "var(--warn)" }}
    >
      <Icon style={{ color: INK }} children="visibility" />
      <Text
        weight="bolder"
        className="flex-1"
        style={{ color: INK }}
        children={`Stai impersonando ${activeUser.name} (${activeUser.email})`}
      />
      <Btn
        icon="logout"
        label="Esci dall'impersonazione"
        color={INK}
        iconStyle={{ color: INK }}
        labelStyle={{ color: INK }}
        disabled={ending}
        onClick={handleEnd}
      />
    </div>
  );
};

export default ImpersonationToolbar;
