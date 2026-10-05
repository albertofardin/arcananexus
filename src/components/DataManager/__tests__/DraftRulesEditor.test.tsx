import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DraftRulesEditor from "@/components/DataManager/DraftRulesEditor";
import type { DraftRequirement } from "@/components/DataManager/useEntryForm";
import ToastProvider from "@/components/_core/Toast";

const click1 = (el: HTMLElement) => fireEvent.click(el, { detail: 1 });

const dataTypeBase = {
  campaignId: 1,
  description: null,
  cardinality: "multi",
  assignability: "none",
  mandatory: false,
  sidebarShow: true,
  sidebarOrder: null,
  icon: null,
  renderAs: "catalog",
  visibility: "visible",
};

const mockFetch = () => {
  global.fetch = vi.fn((url: RequestInfo | URL) => {
    const href = String(url);
    if (href.includes("/data-types")) {
      return Promise.resolve({
        ok: true,
        json: async () => [
          { ...dataTypeBase, id: 1, name: "Talenti", kind: "talent" },
        ],
      } as Response);
    }
    if (href.includes("/reference-data")) {
      return Promise.resolve({
        ok: true,
        json: async () => [
          {
            id: 10,
            dataTypeId: 1,
            name: "Postino",
            description: null,
            flags: null,
            visibility: "visible",
            fileUrl: null,
            fileKey: null,
            externalId: null,
          },
          {
            id: 11,
            dataTypeId: 1,
            name: "Combattente",
            description: null,
            flags: null,
            visibility: "visible",
            fileUrl: null,
            fileKey: null,
            externalId: null,
          },
        ],
      } as Response);
    }
    return Promise.reject(new Error(`Unhandled fetch: ${href}`));
  }) as unknown as typeof fetch;
};

const Harness = () => {
  const [value, setValue] = React.useState<DraftRequirement[]>([]);
  return (
    <DraftRulesEditor
      campaignSlug="test-campaign"
      value={value}
      onChange={setValue}
    />
  );
};

const renderEditor = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Harness />
      </ToastProvider>
    </QueryClientProvider>
  );
};

describe("DraftRulesEditor", () => {
  it("mostra la Categoria oltre al nome anche sui requisiti già aggiunti alla lista", async () => {
    mockFetch();
    renderEditor();

    click1(await screen.findByText("Seleziona..."));
    click1(await screen.findByRole("button", { name: /talenti/i }));

    click1(await screen.findByText("Seleziona una voce..."));
    click1(await screen.findByRole("button", { name: /postino/i }));

    click1(screen.getByRole("button", { name: /^aggiungi$/i }));

    // Riga aggiunta alla lista dei requisiti (non il select "Categoria",
    // che continua a mostrare "Talenti" come selezione corrente).
    const row = (await screen.findByText("Postino")).closest(
      "div.rounded"
    ) as HTMLElement;
    expect(within(row).getByText("Talenti")).toBeInTheDocument();
    expect(within(row).getByText("Postino")).toBeInTheDocument();
  });

  it("cliccare una riga la carica nel form ed 'AGGIORNA' la sostituisce invece di duplicarla", async () => {
    mockFetch();
    renderEditor();

    click1(await screen.findByText("Seleziona..."));
    click1(await screen.findByRole("button", { name: /talenti/i }));
    click1(await screen.findByText("Seleziona una voce..."));
    click1(await screen.findByRole("button", { name: /postino/i }));
    click1(screen.getByRole("button", { name: /^aggiungi$/i }));

    // Click sulla riga: precompila il form (Categoria già "Talenti", Voce
    // già "Postino") e il pulsante diventa "AGGIORNA".
    const row = (await screen.findByText("Postino")).closest(
      "div.rounded"
    ) as HTMLElement;
    click1(row);

    expect(
      await screen.findByRole("button", { name: /^aggiorna$/i })
    ).toBeInTheDocument();

    // Riapre il select "Voce" (già valorizzato su "Postino", niente più
    // placeholder) cliccando il campo stesso invece del testo, ambiguo ora
    // che "Postino" compare sia nella riga sia nel campo precompilato.
    const voceField = screen.getByText("Voce").closest(".relative");
    click1(voceField as HTMLElement);
    click1(await screen.findByRole("button", { name: /combattente/i }));
    click1(screen.getByRole("button", { name: /^aggiorna$/i }));

    expect(await screen.findByText("Combattente")).toBeInTheDocument();
    expect(screen.queryByText("Postino")).not.toBeInTheDocument();
  });
});
