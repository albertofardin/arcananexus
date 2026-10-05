"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/_core/Toast";

interface RunOptions {
  /** Messaggio di errore di fallback, usato se la risposta non porta `error`. */
  errorMessage: string;
  /** Se presente, mostrato come toast di successo. */
  successMessage?: string;
  /** Se true, chiama `router.refresh()` dopo una risposta ok. */
  refresh?: boolean;
  /** Richiamato dopo una risposta ok (dopo l'eventuale refresh). */
  onSuccess?: () => void;
}

// Incapsula il pattern fetch → toast di errore/successo → refresh ripetuto
// nelle azioni di mutazione dei componenti scheda personaggio (toggle
// visibilità, concessione/rimozione talenti, aggiornamento contatori/XP):
// gestisce submitting state, parsing dell'eventuale `{ error }` nel body e
// try/catch, lasciando al chiamante solo la richiesta e i messaggi.
export function useApiAction() {
  const { showToast } = useToast();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const run = React.useCallback(
    async (
      input: RequestInfo,
      init: RequestInit | undefined,
      options: RunOptions
    ): Promise<boolean> => {
      setPending(true);
      try {
        const response = await fetch(input, init);

        if (!response.ok) {
          const json = await response.json().catch(() => null);
          showToast({
            variant: "error",
            message: json?.error ?? options.errorMessage,
          });
          return false;
        }

        if (options.successMessage) {
          showToast({ variant: "success", message: options.successMessage });
        }
        if (options.refresh) router.refresh();
        options.onSuccess?.();
        return true;
      } catch (err) {
        console.error(err);
        showToast({ variant: "error", message: options.errorMessage });
        return false;
      } finally {
        setPending(false);
      }
    },
    [router, showToast]
  );

  return { pending, run };
}
