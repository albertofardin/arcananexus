import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DataTypeKind, DataVisibility } from "@prisma/client";
import ModalTalents from "../ModalTalents";
import type { TalentAccordionEntry } from "@/components/TalentList";
import ToastProvider from "@/components/_core/Toast";
import {
  mockCharacterData,
  mockDataType,
  mockReferenceData,
} from "@/test/helpers/prisma-fixtures";

// `Btn`/`BtnBase` distinguono singolo/doppio click da `event.detail` (1 vs
// 2) — `fireEvent.click` di jsdom lo lascia a 0 di default, ignorato in
// silenzio. Stesso accorgimento già in `CharacterEditorAnagraphic.test.tsx`.
const click1 = (el: HTMLElement) => fireEvent.click(el, { detail: 1 });

function buildTalentEntry({
  id,
  name,
  category,
  visibility = DataVisibility.hidden,
}: {
  id: number;
  name: string;
  category?: string;
  visibility?: DataVisibility;
}): TalentAccordionEntry {
  return {
    id,
    name,
    description: null,
    visibility,
    flags: category ? { category } : null,
  };
}

function renderModalTalents(
  overrides: Partial<React.ComponentProps<typeof ModalTalents>> = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ModalTalents
            open
            onClose={vi.fn()}
            campaignSlug="test-campaign"
            characterId={1}
            viewingAsMaster
            canEdit
            acquiredTalents={[]}
            entries={[]}
            requirements={[]}
            ownedReferenceDataIds={new Set()}
            unlockedReferenceDataIds={new Set()}
            draftCounts={new Map()}
            onAcquireDraft={vi.fn()}
            onReleaseDraft={vi.fn()}
            draftXpAvailable={0}
            {...overrides}
          />
        </ToastProvider>
      </QueryClientProvider>
    ),
  };
}

describe("ModalTalents — occhio unlock del master (T-0xx)", () => {
  it("sblocca per questo personaggio un talento-catalogo nascosto (POST .../talents/unlocks)", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });

    renderModalTalents({
      entries: [
        buildTalentEntry({
          id: 1,
          name: "Classe Segreta",
          category: "Combattimento",
          visibility: DataVisibility.hidden,
        }),
      ],
    });

    // Vista a due livelli di default: entra nella categoria per vedere la riga.
    fireEvent.click(screen.getByText("Combattimento"));

    click1(
      screen.getByRole("button", { name: "Sblocca per questo personaggio" })
    );

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/campaigns/test-campaign/characters/1/talents/unlocks",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ referenceDataId: 1 }),
        })
      )
    );
  });

  it("blocca di nuovo un talento già sbloccato (DELETE .../talents/unlocks/:id)", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });

    renderModalTalents({
      entries: [
        buildTalentEntry({
          id: 1,
          name: "Classe Segreta",
          category: "Combattimento",
          visibility: DataVisibility.hidden,
        }),
      ],
      unlockedReferenceDataIds: new Set([1]),
    });

    fireEvent.click(screen.getByText("Combattimento"));

    click1(
      screen.getByRole("button", {
        name: "Blocca di nuovo per questo personaggio",
      })
    );

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/campaigns/test-campaign/characters/1/talents/unlocks/1",
        expect.objectContaining({ method: "DELETE" })
      )
    );
  });

  it("l'occhio di categoria sblocca solo i talenti ancora bloccati, non quelli già sbloccati", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });

    renderModalTalents({
      entries: [
        buildTalentEntry({
          id: 1,
          name: "Alpha",
          category: "Combattimento",
          visibility: DataVisibility.hidden,
        }),
        buildTalentEntry({
          id: 2,
          name: "Beta",
          category: "Combattimento",
          visibility: DataVisibility.hidden,
        }),
      ],
      unlockedReferenceDataIds: new Set([2]),
    });

    fireEvent.click(screen.getByText("Combattimento"));

    click1(
      screen.getByRole("button", {
        name: "Sblocca tutta la categoria per questo personaggio",
      })
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/campaigns/test-campaign/characters/1/talents/unlocks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ referenceDataId: 1 }),
      })
    );
  });

  it("non mostra l'occhio su un talento già posseduto (niente da sbloccare)", () => {
    renderModalTalents({
      entries: [
        buildTalentEntry({
          id: 1,
          name: "Talento Posseduto",
          category: "Combattimento",
          visibility: DataVisibility.hidden,
        }),
      ],
      // `ownedReferenceDataIds` (Set globale) e `acquiredTalents` (righe
      // possedute, da cui deriva il conteggio per talento) devono restare
      // coerenti fra loro, come lo sono sempre nei dati reali del server.
      acquiredTalents: [
        {
          ...mockCharacterData({
            id: 100,
            characterId: 1,
            dataTypeId: 10,
            referenceDataId: 1,
          }),
          dataType: mockDataType({ id: 10, kind: DataTypeKind.talent }),
          referenceData: mockReferenceData({
            id: 1,
            dataTypeId: 10,
            name: "Talento Posseduto",
          }),
        },
      ],
      ownedReferenceDataIds: new Set([1]),
    });

    fireEvent.click(screen.getByText("Combattimento"));

    expect(
      screen.queryByRole("button", { name: "Sblocca per questo personaggio" })
    ).not.toBeInTheDocument();
  });

  it("mostra l'occhio di categoria già nella lista categorie, senza dover entrare nella categoria", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });

    renderModalTalents({
      entries: [
        buildTalentEntry({
          id: 1,
          name: "Classe Segreta",
          category: "Combattimento",
          visibility: DataVisibility.hidden,
        }),
      ],
    });

    // Nessun click su "Combattimento": l'occhio deve comparire già sulla
    // riga della categoria nella vista "Listati" di default.
    click1(
      screen.getByRole("button", {
        name: "Sblocca tutta la categoria per questo personaggio",
      })
    );

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/campaigns/test-campaign/characters/1/talents/unlocks",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ referenceDataId: 1 }),
        })
      )
    );
    // Il click sull'occhio non deve propagarsi al bottone della riga:
    // restiamo nella lista categorie (si vede solo l'etichetta della
    // categoria), non si entra nel dettaglio (che mostrerebbe il nome del
    // singolo talento nell'accordion).
    expect(screen.getByText("Combattimento")).toBeInTheDocument();
    expect(screen.queryByText("Classe Segreta")).not.toBeInTheDocument();
  });

  it("in vista giocatore un talento nascosto e non sbloccato per questo personaggio sparisce del tutto (non solo l'occhio)", () => {
    renderModalTalents({
      viewingAsMaster: false,
      entries: [
        buildTalentEntry({
          id: 1,
          name: "Classe Segreta",
          category: "Combattimento",
          visibility: DataVisibility.hidden,
        }),
      ],
    });

    // Bug T-0xx: `entries` arriva dal server sempre "vista master" (la
    // route non sa nulla del toggle client-side) — senza il filtro
    // client-side qui, il master in "player view" vedrebbe comunque la
    // categoria e il talento nascosto, invece della lista vuota che
    // vedrebbe davvero il giocatore.
    expect(screen.queryByText("Combattimento")).not.toBeInTheDocument();
    expect(screen.queryByText("Classe Segreta")).not.toBeInTheDocument();
  });

  it("in vista giocatore un talento sbloccato per questo personaggio resta visibile, ma senza occhio (nessun controllo master)", () => {
    renderModalTalents({
      viewingAsMaster: false,
      entries: [
        buildTalentEntry({
          id: 1,
          name: "Classe Segreta",
          category: "Combattimento",
          visibility: DataVisibility.hidden,
        }),
      ],
      unlockedReferenceDataIds: new Set([1]),
    });

    fireEvent.click(screen.getByText("Combattimento"));

    expect(screen.getByText("Classe Segreta")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sblocca per questo personaggio" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Blocca di nuovo per questo personaggio",
      })
    ).not.toBeInTheDocument();
  });

  it("in vista giocatore un talento posseduto ma nascosto dal master (CharacterData.visibility: hidden) non compare in lista", () => {
    renderModalTalents({
      viewingAsMaster: false,
      acquiredTalents: [
        {
          ...mockCharacterData({
            id: 100,
            characterId: 1,
            dataTypeId: 10,
            referenceDataId: 1,
            visibility: DataVisibility.hidden,
          }),
          dataType: mockDataType({ id: 10, kind: DataTypeKind.talent }),
          referenceData: mockReferenceData({
            id: 1,
            dataTypeId: 10,
            name: "Talento Segreto Posseduto",
          }),
        },
      ],
      ownedReferenceDataIds: new Set([1]),
    });

    expect(
      screen.queryByText("Talento Segreto Posseduto")
    ).not.toBeInTheDocument();
  });
});
