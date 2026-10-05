import * as React from "react";
import { describe, it, expect, vi, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DataVisibility } from "@prisma/client";
import ManagerDataTalents from "@/components/DataManager/ManagerDataTalents";
import type { ContentEntry } from "@/components/DataManager/types";
import ToastProvider from "@/components/_core/Toast";

/**
 * ManagerDataTalents (T-046): navigazione a due livelli client-side (nessuna
 * route diversa) — lista di categorie di talenti, click su una categoria per
 * esplorare i suoi talenti in ordine alfabetico con un bottone per tornare
 * indietro. La ricerca (sopra la lista di categorie, visibile solo con >=10
 * voci) salta la navigazione: filtra per nome e mostra i risultati
 * raggruppati per categoria.
 */

const buildEntry = (overrides: Partial<ContentEntry> = {}): ContentEntry => ({
  id: 1,
  name: "Voce",
  description: null,
  visibility: DataVisibility.visible,
  flags: { cost: 3, repeatable: false, creationOnly: false },
  ...overrides,
});

// L'accordion di ogni riga monta `TalentRequirements` (T-046/T-030), che usa
// `useQuery` per i requisiti: serve sempre un `QueryClientProvider`, anche
// quando il test non ispeziona i requisiti stessi.
const renderManager = (
  overrides: Partial<React.ComponentProps<typeof ManagerDataTalents>> = {}
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ManagerDataTalents
            campaignSlug="test-campaign"
            dataTypeId={99}
            entries={[]}
            isMaster={false}
            {...overrides}
          />
        </ToastProvider>
      </QueryClientProvider>
    ),
  };
};

describe("ManagerDataTalents (T-046)", () => {
  it("mostra la lista di categorie invece dei talenti, senza navigare", () => {
    const entries = [
      buildEntry({ id: 1, name: "Zeta", flags: { category: "Combattimento" } }),
      buildEntry({
        id: 2,
        name: "Alpha",
        flags: { category: "Combattimento" },
      }),
      buildEntry({ id: 3, name: "Beta", flags: { category: "Sopravvivenza" } }),
    ];

    renderManager({ entries });

    expect(screen.getByText("Combattimento")).toBeInTheDocument();
    expect(screen.getByText("Sopravvivenza")).toBeInTheDocument();
    expect(screen.queryByText("Zeta")).not.toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });

  it("esplora i talenti di una categoria al click, ordinati alfabeticamente, e torna indietro col bottone", () => {
    const entries = [
      buildEntry({ id: 1, name: "Zeta", flags: { category: "Combattimento" } }),
      buildEntry({
        id: 2,
        name: "Alpha",
        flags: { category: "Combattimento" },
      }),
      buildEntry({ id: 3, name: "Beta", flags: { category: "Sopravvivenza" } }),
    ];

    renderManager({ entries });

    fireEvent.click(screen.getByText("Combattimento"));

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Zeta")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();

    const html = document.body.innerHTML;
    expect(html.indexOf("Alpha")).toBeLessThan(html.indexOf("Zeta"));

    fireEvent.click(screen.getByRole("button", { name: /listati/i }), {
      detail: 1,
    });

    expect(screen.getByText("Combattimento")).toBeInTheDocument();
    expect(screen.getByText("Sopravvivenza")).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });

  it("mostra il costo XP sulla riga del talento", () => {
    const entries = [
      buildEntry({
        id: 1,
        name: "Alpha",
        flags: { category: "Combattimento", cost: 7 },
      }),
    ];

    renderManager({ entries });
    fireEvent.click(screen.getByText("Combattimento"));

    expect(screen.getByText("7 XP")).toBeInTheDocument();
  });

  it("apre l'accordion al click sulla riga e mostra la descrizione", () => {
    const entries = [
      buildEntry({
        id: 1,
        name: "Alpha",
        description: "Una descrizione dettagliata",
        flags: { category: "Combattimento" },
      }),
    ];

    renderManager({ entries });
    fireEvent.click(screen.getByText("Combattimento"));

    expect(
      screen.queryByText("Una descrizione dettagliata")
    ).not.toBeInTheDocument();

    // Riga dell'accordion (`TalentAccordionRow`, basata su `BtnBase`): jsdom
    // lascia `event.detail` a 0 di default su `fireEvent.click`, che
    // `BtnBase` ignora silenziosamente (nessun handler scatta) — serve
    // esplicitare `detail: 1`, stesso accorgimento già usato sopra per il
    // bottone "categorie".
    fireEvent.click(screen.getByText("Alpha"), { detail: 1 });

    expect(screen.getByText("Una descrizione dettagliata")).toBeInTheDocument();
  });

  it("con la ricerca filtra i talenti per nome e li mostra raggruppati per categoria, senza passare dalla lista di categorie", async () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      buildEntry({
        id: i + 1,
        name: `Talento ${i}`,
        flags: { category: i % 2 === 0 ? "Combattimento" : "Sopravvivenza" },
      })
    );
    entries.push(
      buildEntry({
        id: 100,
        name: "Fuoco Sacro",
        flags: { category: "Combattimento" },
      })
    );

    renderManager({ entries });

    const search = screen.getByPlaceholderText("Cerca...");
    fireEvent.change(search, { target: { value: "Fuoco" } });

    await waitFor(() =>
      expect(screen.getByText("Fuoco Sacro")).toBeInTheDocument()
    );
    expect(screen.getByText("Combattimento")).toBeInTheDocument();
    expect(screen.queryByText("Sopravvivenza")).not.toBeInTheDocument();
    expect(screen.queryByText("Talento 0")).not.toBeInTheDocument();
  });

  it("non mostra la ricerca con meno di 10 voci", () => {
    const entries = [buildEntry({ id: 1, name: "Alpha" })];
    renderManager({ entries });

    expect(screen.queryByPlaceholderText("Cerca...")).not.toBeInTheDocument();
  });

  it("mostra i bottoni modifica/elimina solo quando isMaster è true", () => {
    const entries = [buildEntry({ id: 1, name: "Alpha" })];

    const { rerender, queryClient } = renderManager({
      entries,
      isMaster: false,
    });
    fireEvent.click(screen.getByText("Senza categoria"));
    expect(
      screen.queryByRole("button", { name: "Modifica" })
    ).not.toBeInTheDocument();

    // Stesso `queryClient`/wrapper del render iniziale (vedi commento su
    // `renderManager`): un albero radice diverso smonterebbe e rimonterebbe
    // `ManagerDataTalents`, perdendo la categoria selezionata e facendo
    // sparire di nuovo il bottone "Modifica" appena verificato.
    rerender(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ManagerDataTalents
            campaignSlug="test-campaign"
            dataTypeId={99}
            entries={entries}
            isMaster={true}
          />
        </ToastProvider>
      </QueryClientProvider>
    );
    expect(
      screen.getByRole("button", { name: "Modifica" })
    ).toBeInTheDocument();
  });

  it("non mostra alcun bottone di riordino manuale (decisione utente T-046)", () => {
    const entries = [
      buildEntry({
        id: 1,
        name: "Alpha",
        flags: { category: "Combattimento" },
      }),
      buildEntry({ id: 2, name: "Beta", flags: { category: "Combattimento" } }),
    ];

    renderManager({ entries, isMaster: true });
    fireEvent.click(screen.getByText("Combattimento"));

    expect(
      screen.queryByRole("button", { name: /sposta su/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /sposta giù/i })
    ).not.toBeInTheDocument();
  });

  it("mostra requisiti/blocchi nell'accordion solo per il master, caricandoli al momento dell'espansione", async () => {
    const entries = [
      buildEntry({
        id: 1,
        name: "Alpha",
        flags: { category: "Combattimento" },
      }),
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        requires: [
          {
            id: 10,
            definitionId: 1,
            requiredDefinitionId: 2,
            type: "requires",
            groupId: null,
            requiredDefinition: {
              id: 2,
              name: "Beta",
              dataType: { id: 99, name: "Talenti" },
            },
          },
        ],
        requiredBy: [],
      }),
    });

    renderManager({ entries, isMaster: true });

    fireEvent.click(screen.getByText("Combattimento"));
    fireEvent.click(screen.getByText("Alpha"), { detail: 1 });

    await waitFor(() =>
      expect(screen.getByText("Richiede: Beta")).toBeInTheDocument()
    );
    expect((global.fetch as Mock).mock.calls[0][0]).toContain(
      "/reference-data/1/requirements"
    );
  });
});
