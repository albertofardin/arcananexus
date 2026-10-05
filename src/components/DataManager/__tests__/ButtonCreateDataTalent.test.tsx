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
import ButtonCreateDataTalent from "@/components/DataManager/ButtonCreateDataTalent";
import ToastProvider from "@/components/_core/Toast";

/**
 * `ModalEditDataTalent` (form dedicato ai talenti, attributi hardcoded invece
 * che derivati genericamente da `FlagsForm`): a differenza di
 * `ButtonCreateDataCatalog`, i requisiti si impostano in bozza già in
 * creazione (`DraftRulesEditor`, inviati col POST), quindi la modale
 * si chiude subito dopo il CREA invece di passare in modifica. Più le
 * checkbox "+1pt Missiva/Downtime" condizionate alle Feature di
 * campagna.
 */

const click1 = (el: HTMLElement) => fireEvent.click(el, { detail: 1 });

const createdEntry = {
  id: 42,
  name: "Postino",
  description: null,
  visibility: "visible",
  flags: {
    cost: 0,
    repeatable: false,
    creationOnly: false,
    isDowntimeUsable: false,
    isMissivePointBonus: false,
    isDowntimePointBonus: false,
  },
};

const mockFetch = () => {
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
};

const renderButton = (
  overrides: Partial<React.ComponentProps<typeof ButtonCreateDataTalent>> = {}
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ButtonCreateDataTalent
          campaignSlug="test-campaign"
          dataTypeId={99}
          {...overrides}
        />
      </ToastProvider>
    </QueryClientProvider>
  );
};

describe("ButtonCreateDataTalent", () => {
  it("dopo la creazione chiude la modale (i requisiti sono già inviati in bozza col POST)", async () => {
    mockFetch();
    renderButton();

    click1(screen.getByRole("button", { name: /aggiungi/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Nuovo talento")).toBeInTheDocument();

    const titleInput = await screen.findByPlaceholderText("Titolo...");
    // `FieldText` propaga il valore solo dopo il proprio debounce (500ms).
    fireEvent.change(titleInput, { target: { value: "Postino" } });
    await new Promise(resolve => setTimeout(resolve, 600));

    click1(screen.getByRole("button", { name: /^crea$/i }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
  });

  it("mostra le checkbox punto Missiva/Downtime solo quando la relativa Feature è attiva", async () => {
    mockFetch();
    renderButton({ missiveActive: true, downtimeActive: false });

    click1(screen.getByRole("button", { name: /aggiungi/i }));
    await screen.findByRole("dialog");

    expect(await screen.findByText("+1pt Missiva")).toBeInTheDocument();
    expect(screen.queryByText("+1pt Downtime")).not.toBeInTheDocument();
  });
});
