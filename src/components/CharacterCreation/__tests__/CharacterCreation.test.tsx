import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";
import CharacterCreationForm, {
  type CatalogDataType,
  type CatalogRequirementEdge,
} from "../CharacterCreation";
import ToastProvider from "@/components/_core/Toast";

/**
 * Form di creazione PG (T-022): solo dati identitari (razza/fazione, `kind`
 * "origins"/"assignable") sono selezionabili in fase di creazione —
 * cardinalità single sostituisce, multi accumula. Talenti e budget XP non
 * fanno più parte di questo form: si gestiscono dopo l'approvazione del
 * personaggio (vedi il testo mostrato in `CharacterCreation.tsx`).
 *
 * `click1`: i componenti `core` basati su `BtnBase` distinguono singolo/
 * doppio click da `event.detail` (1 vs 2) — `fireEvent.click` di jsdom lo
 * lascia a 0 di default, che `BtnBase` ignora silenziosamente (nessuna delle
 * due callback scatta). Stesso accorgimento già usato in
 * `impersonation-flow.test.tsx`.
 */
const click1 = (el: HTMLElement) => fireEvent.click(el, { detail: 1 });

// Catalogo di prova: una sola razza single (Umano 10 XP, Elfo 20 XP) — nessun
// data-type "talent" (non selezionabile in creazione) e nessun requisito da
// verificare (nessuna coppia di voci identitarie in conflitto/dipendenza
// nel seed di riferimento).
const RACE_DATA_TYPE_ID = 1;
const UMANO_ID = 101;
const ELFO_ID = 102;

const catalog: CatalogDataType[] = [
  {
    id: RACE_DATA_TYPE_ID,
    name: "Razza",
    kind: "origins",
    cardinality: "single",
    description: null,
    icon: null,
    mandatory: true,
    masterOnly: false,
    referenceData: [
      {
        id: UMANO_ID,
        name: "Umano",
        description: null,
        flags: { startingPx: 10 },
      },
      {
        id: ELFO_ID,
        name: "Elfo",
        description: null,
        flags: { startingPx: 20 },
      },
    ],
  },
];

const requirements: CatalogRequirementEdge[] = [];

const CAMPAIGN_SLUG = "campagna-di-prova";

const renderForm = (isMaster: boolean) =>
  render(
    <ToastProvider>
      <CharacterCreationForm
        campaignSlug={CAMPAIGN_SLUG}
        isMaster={isMaster}
        catalog={catalog}
        requirements={requirements}
      />
    </ToastProvider>
  );

describe("CharacterCreationForm — creazione PG con catalogo (T-022)", () => {
  beforeEach(() => {
    vi.mocked(useRouter).mockReturnValue({
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    } as unknown as ReturnType<typeof useRouter>);
  });

  it("cardinalità single: selezionare una seconda razza sostituisce la prima", async () => {
    renderForm(false);

    click1(screen.getByText("Nessuna selezione"));
    click1(await screen.findByText("Umano"));
    expect(screen.getByText("Umano")).toBeInTheDocument();

    // Riapre e sceglie Elfo: sostituisce Umano (single, non si accumula).
    // `FieldSelect` ignora la riapertura entro 300ms dall'ultima chiusura
    // (anti-flicker sul click di chiusura del backdrop): attende quella
    // finestra prima di ririaprire.
    await new Promise(resolve => setTimeout(resolve, 350));
    click1(screen.getByText("Umano"));
    click1(await screen.findByText("Elfo"));

    await waitFor(() => {
      expect(screen.getByText("Elfo")).toBeInTheDocument();
      expect(screen.queryByText("Umano")).not.toBeInTheDocument();
    });
  });

  // T-0xx: `mandatory: true` (Razza, kind: origins) senza nessuna selezione
  // blocca il submit incondizionatamente (validazione di form base, non
  // bypassabile dal master) — nessuna richiesta parte verso il server.
  it("blocca il submit con un toast se una categoria identitaria mandatory non ha nessuna voce selezionata", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    renderForm(false);

    fireEvent.change(screen.getByPlaceholderText("Nome del personaggio..."), {
      target: { value: "Aria" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Racconta le origini/), {
      target: { value: "Un passato misterioso." },
    });
    await new Promise(resolve => setTimeout(resolve, 600));

    click1(screen.getByRole("button", { name: /^invia$/i }));

    expect(
      await screen.findByText("Campo obbligatorio mancante: Razza")
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // T-0xx: `dataType.masterOnly` (calcolato server-side in `page.tsx`,
  // presente solo per lo staff — un giocatore non riceve mai questi
  // `DataType` nel catalogo) mostra il badge "Solo Master" accanto al
  // campo, per ricordare allo staff che il giocatore non lo vedrebbe.
  it("mostra il badge 'Solo Master' per un campo masterOnly", () => {
    const masterOnlyCatalog: CatalogDataType[] = [
      {
        id: 2,
        name: "Malattie strane",
        kind: "assignable",
        cardinality: "single",
        description: null,
        icon: null,
        mandatory: false,
        masterOnly: true,
        referenceData: [
          {
            id: 201,
            name: "Peste dell'Abisso",
            description: null,
            flags: null,
          },
        ],
      },
    ];

    render(
      <ToastProvider>
        <CharacterCreationForm
          campaignSlug={CAMPAIGN_SLUG}
          isMaster
          catalog={masterOnlyCatalog}
          requirements={requirements}
        />
      </ToastProvider>
    );

    // `Badge`/`BtnBase` rendono un doppione del testo (echo per tooltip,
    // non visibile ma presente nel DOM): `getAllByText` invece di
    // `getByText`, che fallirebbe su match multipli.
    expect(screen.getAllByText("Solo Master").length).toBeGreaterThan(0);
  });

  it("non mostra il badge 'Solo Master' per un campo ordinario", () => {
    renderForm(false);

    expect(screen.queryByText("Solo Master")).not.toBeInTheDocument();
  });

  // T-050: arco `grants` (Razza Elfo → talento "Sangue elfico"): avviso,
  // talento già selezionato e non inviato come assegnazione (lo applica il
  // server a cascata).
  describe("arco grants (Aggiunge)", () => {
    const SANGUE_ID = 301;
    const grantCatalog: CatalogDataType[] = [
      ...catalog,
      {
        id: 3,
        name: "Talenti",
        kind: "talent",
        cardinality: "multi",
        description: null,
        icon: null,
        mandatory: false,
        masterOnly: false,
        referenceData: [
          {
            id: SANGUE_ID,
            name: "Sangue elfico",
            description: null,
            flags: { cost: 5, repeatable: false, creationOnly: false },
          },
        ],
      },
    ];

    const renderGrant = () =>
      render(
        <ToastProvider>
          <CharacterCreationForm
            campaignSlug={CAMPAIGN_SLUG}
            isMaster={false}
            catalog={grantCatalog}
            requirements={[]}
            grants={[
              { definitionId: ELFO_ID, requiredDefinitionId: SANGUE_ID },
            ]}
          />
        </ToastProvider>
      );

    it("avvisa che la razza conferisce gratis il talento e lo mostra già selezionato", async () => {
      renderGrant();
      expect(
        screen.queryByText("Ottieni gratuitamente")
      ).not.toBeInTheDocument();

      click1(screen.getByText("Nessuna selezione"));
      click1(await screen.findByText("Elfo"));

      expect(
        await screen.findByText("Ottieni gratuitamente")
      ).toBeInTheDocument();
      expect(
        screen.getAllByText("Sangue elfico (da Elfo)").length
      ).toBeGreaterThan(0);
      expect(screen.getByDisplayValue("Sangue elfico")).toBeInTheDocument();
    });

    it("non invia il talento conferito tra le assegnazioni", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ character: { id: 1 } }),
      } as Response);
      renderGrant();

      fireEvent.change(screen.getByPlaceholderText("Nome del personaggio..."), {
        target: { value: "Aria" },
      });
      fireEvent.change(screen.getByPlaceholderText(/Racconta le origini/), {
        target: { value: "Un passato misterioso." },
      });
      click1(screen.getByText("Nessuna selezione"));
      click1(await screen.findByText("Elfo"));
      await new Promise(resolve => setTimeout(resolve, 600));

      click1(screen.getByRole("button", { name: /^invia$/i }));

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      expect(body.assignments).toEqual([{ referenceDataId: ELFO_ID }]);
    });
  });
});
