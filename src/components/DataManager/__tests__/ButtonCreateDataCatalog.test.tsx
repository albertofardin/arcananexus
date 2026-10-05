import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DataTypeKind } from "@prisma/client";
import ButtonCreateDataCatalog from "@/components/DataManager/ButtonCreateDataCatalog";
import type { EntryFormAdvancedConfig } from "@/components/DataManager/useEntryForm";
import ToastProvider from "@/components/_core/Toast";

/**
 * In creazione la voce non ha ancora un id: i requisiti si impostano in
 * bozza (`DraftRulesEditor`, come in `ModalEditDataTalent`) e vengono
 * inviati insieme al POST di creazione, quindi la modale si chiude subito
 * dopo il CREA invece di passare in modifica.
 */

const click1 = (el: HTMLElement) => fireEvent.click(el, { detail: 1 });

// `talent` ha ora il proprio `ModalEditDataTalent`/`ButtonCreateDataTalent`
// dedicati (vedi quel test file): questo esercita il meccanismo generico
// condiviso dagli altri kind avanzati (es. `origins`, le Razze).
const advanced: EntryFormAdvancedConfig = {
  kind: DataTypeKind.origins,
};

const createdEntry = {
  id: 42,
  name: "Umano",
  description: null,
  visibility: "visible",
  flags: { startingPx: 0 },
};

const renderButton = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ButtonCreateDataCatalog
          campaignSlug="test-campaign"
          dataTypeId={99}
          advanced={advanced}
        />
      </ToastProvider>
    </QueryClientProvider>
  );
};

describe("ButtonCreateDataCatalog", () => {
  it("dopo la creazione chiude la modale (i requisiti sono già inviati in bozza col POST)", async () => {
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const href = String(url);
      if (method === "POST" && href.endsWith("/reference-data")) {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => createdEntry,
        } as Response);
      }
      if (method === "GET" && href.includes("/requirements")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ requires: [], requiredBy: [] }),
        } as Response);
      }
      if (method === "GET" && href.includes("/reference-data")) {
        return Promise.resolve({ ok: true, json: async () => [] } as Response);
      }
      return Promise.reject(new Error(`Unhandled fetch: ${method} ${href}`));
    }) as unknown as typeof fetch;

    renderButton();

    click1(screen.getByRole("button", { name: /aggiungi/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Nuova voce")).toBeInTheDocument();

    // Il contenuto della modale monta con un frame di ritardo (rAF +
    // startTransition, vedi Modal.tsx), va atteso invece di interrogarlo in
    // modo sincrono subito dopo il dialog.
    const titleInput = await screen.findByPlaceholderText("Titolo...");

    // `FieldText` propaga il valore solo dopo il proprio debounce (500ms).
    fireEvent.change(titleInput, { target: { value: "Umano" } });
    await new Promise(resolve => setTimeout(resolve, 600));

    click1(screen.getByRole("button", { name: /^crea$/i }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
  });
});
