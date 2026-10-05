import {
  describe,
  it,
  expect,
  beforeAll,
  afterEach,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { useParams, useRouter } from "next/navigation";
import ManagerDataTypes from "@/components/DataTypeManager/ManagerDataTypes";
import ToastProvider from "@/components/_core/Toast";
import type { DataTypeAdmin } from "@/lib/validations/dataType";

/**
 * Test di integrazione (T-029): esercita davvero fetch + Zod contro route
 * `/api/campaigns/:campaignSlug/data-types(/:id)` servite da MSW, con uno
 * store in-memory che riproduce il comportamento reale dell'API T-016
 * (`done`, non toccata da questo task — solo consumata). Stesso pattern di
 * `impersonation-flow.test.tsx`.
 *
 * La guardia head_master (criterio "un non-head_master non vede la pagina")
 * è coperta a fondo in `admin/__tests__/layout.test.tsx`: quel layout
 * avvolge genericamente `{children}` per l'intero segmento `admin/*`
 * (incluso `admin/data-types`, che non ha logica di autorizzazione propria
 * — vedi `admin/data-types/page.tsx`), esattamente come per
 * roles/characters/downtime. Non duplicato qui.
 */

// `useParams` è già mockato globalmente in `src/test/setup.ts`
// (`vi.fn(() => ({}))`): qui basta configurare il valore di ritorno, come
// fa `CharacterCreationForm.test.tsx` per `useRouter`.
const click1 = (el: HTMLElement) => fireEvent.click(el, { detail: 1 });

// Il campo "Nome" non ha più un placeholder dedicato (`FieldText` usa il
// default "Scrivi...", condiviso anche dalla textarea "Descrizione"): lo si
// individua come l'unico `<input>` (vs `<textarea>`) tra i textbox del
// dialog.
// `find*` (non `get*`): il contenuto del modal viene montato con un frame di
// ritardo (rAF + startTransition, vedi Modal.tsx "fix modal animation"), va
// atteso invece di interrogarlo in modo sincrono subito dopo il dialog.
const getNameInput = async (dialog: HTMLElement) => {
  const textboxes = await within(dialog).findAllByRole("textbox");
  const input = textboxes.find(
    (el): el is HTMLInputElement => el.tagName === "INPUT"
  );
  if (!input) throw new Error("Campo Nome non trovato nel dialog");
  return input;
};

const buildDataType = (
  overrides: Partial<DataTypeAdmin> = {}
): DataTypeAdmin => ({
  id: 1,
  campaignId: 1,
  name: "Razze",
  kind: "origins",
  description: null,
  cardinality: "single",
  assignability: "creationOnly",
  mandatory: false,
  sidebarShow: true,
  sidebarOrder: 0,
  icon: null,
  renderAs: "catalog",
  visibility: "visible",
  _count: { referenceData: 0 },
  ...overrides,
});

let store: DataTypeAdmin[];
let nextId = 100;
// dataTypeId -> numero di `CharacterData` assegnate a un PG per una qualunque
// `ReferenceData` di quel tipo (T-036): simula il guard applicativo.
let assignedCharacterDataStore: Record<number, number> = {};

const resetStore = () => {
  store = [
    buildDataType({ id: 1, name: "Razze", kind: "origins", sidebarOrder: 0 }),
    buildDataType({
      id: 2,
      name: "Fazioni",
      kind: "assignable",
      assignability: "creationOnly",
      cardinality: "multi",
      sidebarOrder: 1,
      _count: { referenceData: 3 },
    }),
    buildDataType({
      id: 3,
      name: "Documenti Regolamento",
      kind: "generic",
      cardinality: null,
      assignability: "none",
      renderAs: "files",
      sidebarShow: false,
      sidebarOrder: null,
      _count: { referenceData: 0 },
    }),
  ];
  nextId = 100;
  assignedCharacterDataStore = {};
};

const server = setupServer(
  // Rispecchia il comportamento server-side reale (`GET /data-types`, T-046
  // round 4): nessun filtro, "Talenti" (kind: talent) compare in lista come
  // qualunque altro `DataType`.
  http.get("/api/campaigns/:campaignSlug/data-types", () =>
    HttpResponse.json(store)
  ),
  http.post("/api/campaigns/:campaignSlug/data-types", async ({ request }) => {
    const body = (await request.json()) as Partial<DataTypeAdmin>;
    const created = buildDataType({
      ...body,
      id: nextId++,
      _count: { referenceData: 0 },
    } as Partial<DataTypeAdmin>);
    store.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.patch(
    "/api/campaigns/:campaignSlug/data-types/:id",
    async ({ params, request }) => {
      const id = Number(params.id);
      const body = (await request.json()) as Partial<DataTypeAdmin>;
      const idx = store.findIndex(dt => dt.id === id);
      if (idx === -1) {
        return HttpResponse.json(
          { error: "Categoria non trovata" },
          { status: 404 }
        );
      }
      store[idx] = { ...store[idx], ...body };
      return HttpResponse.json(store[idx]);
    }
  ),
  http.delete("/api/campaigns/:campaignSlug/data-types/:id", ({ params }) => {
    const id = Number(params.id);
    const idx = store.findIndex(dt => dt.id === id);
    if (idx === -1) {
      return HttpResponse.json(
        { error: "Categoria non trovata" },
        { status: 404 }
      );
    }
    // Guard T-036: almeno una voce di questa categoria è assegnata a un PG.
    const assignedCount = assignedCharacterDataStore[id] ?? 0;
    if (assignedCount > 0) {
      return HttpResponse.json(
        {
          error:
            "Impossibile eliminare: una o più voci di questa categoria sono assegnate a dei personaggi",
          details: { assignedCount },
        },
        { status: 409 }
      );
    }
    store.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  })
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const renderManager = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ManagerDataTypes />
      </ToastProvider>
    </QueryClientProvider>
  );
};

describe("ManagerDataTypes (T-029)", () => {
  beforeEach(() => {
    resetStore();
    vi.mocked(useParams).mockReturnValue({ campaignSlug: "test-campaign" });
  });

  it("mostra i tipi di dato caricati con le loro categorie/badge", async () => {
    renderManager();

    expect(await screen.findByText("Razze")).toBeInTheDocument();
    expect(screen.getByText("Fazioni")).toBeInTheDocument();
    expect(screen.getByText("Documenti Regolamento")).toBeInTheDocument();
    // Badge kind/presentazione/conteggio voci di catalogo
    expect(screen.getByText("Origine")).toBeInTheDocument();
    expect(screen.getByText("Archivio documenti e media")).toBeInTheDocument();
    expect(screen.getByText("3 voci")).toBeInTheDocument();
  });

  // T-046 round 4: "Talenti" (kind: talent) torna un `DataType` come un
  // altro anche in questa lista admin generica — compare in lista, "Gestisci
  // voci" porta alla route gemella generica `admin/data-types/Talenti`, e il
  // campo "Tipo (kind)" (disabilitato, kind immutabile) mostra l'etichetta
  // "Talento" invece del placeholder vuoto (bug corretto in `ModalDataType`:
  // `KIND_ITEMS` esclude sempre "talent" perché non selezionabile in
  // creazione, ma in edit di una riga esistente serve comunque l'etichetta).
  it("mostra la riga Talenti, naviga cliccando la riga e mostra 'Talento' (disabilitato) in modifica", async () => {
    store.push(
      buildDataType({
        id: 5,
        name: "Talenti",
        kind: "talent",
        cardinality: "multi",
        assignability: "always",
        sidebarOrder: 2,
        _count: { referenceData: 4 },
      })
    );
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push,
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    } as unknown as ReturnType<typeof useRouter>);

    renderManager();
    await screen.findByText("Talenti");

    // "Talenti" (id 5, sidebarOrder 2) è visibile in sidebar: individuata
    // dalla sua riga, non dall'ultima in assoluto (le categorie non in
    // sidebar, come "Documenti Regolamento", compaiono dopo quelle visibili
    // nell'ordinamento di `ManagerDataTypes`).
    const talentiRow = screen.getByTestId("data-type-row-5");
    click1(talentiRow);
    expect(push).toHaveBeenCalledWith(
      "/dashboard/test-campaign/admin/data-types/Talenti"
    );

    click1(within(talentiRow).getByRole("button", { name: "tune" }));

    const dialog = await screen.findByRole("dialog");
    // Modal.tsx rimanda il mount del contenuto di un frame (rAF +
    // startTransition, vedi "fix modal animation"): va atteso con `find*`
    // invece di interrogarlo in modo sincrono subito dopo il dialog.
    const kindLabel = await within(dialog).findByText("Talento");
    expect(kindLabel).toBeInTheDocument();

    // `kind` è ora modificabile per gli altri tipi (vedi test più sotto), ma
    // "Talenti" resta l'unico caso sempre bloccato: il click sul field non
    // apre il popover con le altre opzioni.
    const kindField = kindLabel.closest("div[class*='cursor-not-allowed']");
    expect(kindField).not.toBeNull();
    fireEvent.click(kindLabel);
    expect(within(dialog).queryByText("Generico")).not.toBeInTheDocument();
  });

  it("invia cardinality: null quando 'Assegnabile dai giocatori' resta disattivato in creazione", async () => {
    renderManager();
    await screen.findByText("Razze");

    click1(screen.getByRole("button", { name: /nuovo tipo di dato/i }));
    const dialog = await screen.findByRole("dialog");
    const nameInput = await getNameInput(dialog);
    fireEvent.change(nameInput, { target: { value: "Regolamenti" } });
    await new Promise(resolve => setTimeout(resolve, 600));

    click1(screen.getByRole("button", { name: /^crea$/i }));

    await waitFor(() =>
      expect(screen.getByText("Tipo di dato creato")).toBeInTheDocument()
    );

    const created = store.find(dt => dt.name === "Regolamenti");
    expect(created?.assignability).toBe("none");
    expect(created?.cardinality).toBeNull();
  });

  // T-047/T-048: passare `assignability` a "Solo master" rende la categoria
  // non assegnabile dal giocatore, ma NON azzera `cardinality` — il master
  // resta comunque in grado di assegnarla
  // (`assignReferenceDataToCharacter` non applica il gate `assignability`
  // al master). Non è quindi il caso distruttivo T-035 (guardato sotto per
  // `kind: "generic"`): nessuna conferma richiesta, salva subito.
  it("passa 'Fazioni' a assignability: masterOnly senza conferma, preservando la cardinalità", async () => {
    renderManager();
    await screen.findByText("Fazioni");

    const editButtons = screen.getAllByRole("button", { name: "tune" });
    click1(editButtons[1]); // "Fazioni"

    const dialog = await screen
      .findByText("Modifica tipo di dato")
      .then(() => screen.getByRole("dialog"));
    click1(await within(dialog).findByText("Solo alla creazione"));
    click1(await screen.findByRole("button", { name: /solo master/i }));
    click1(screen.getByRole("button", { name: /^salva$/i }));

    await waitFor(() =>
      expect(screen.getByText("Tipo di dato aggiornato")).toBeInTheDocument()
    );

    const updated = store.find(dt => dt.id === 2);
    expect(updated?.cardinality).toBe("multi");
    expect(updated?.assignability).toBe("masterOnly");
  });

  // T-035 (round 2, finding reviewer): un `DataType` `kind: "generic"` con
  // una `cardinality` legacy non-null (dato pre-invariante) è l'unico caso
  // che questo form può ancora azzerare — il guard deve chiedere conferma
  // esplicita, non salvare in silenzio.
  it("chiede conferma esplicita prima di azzerare la cardinalità di una categoria generic già in uso", async () => {
    store.push(
      buildDataType({
        id: 5,
        name: "Legacy",
        kind: "generic",
        assignability: "always",
        cardinality: "multi",
        sidebarShow: false,
        sidebarOrder: null,
      })
    );

    renderManager();
    await screen.findByText("Legacy");

    const editButtons = screen.getAllByRole("button", { name: "tune" });
    click1(editButtons[editButtons.length - 1]); // "Legacy"
    click1(screen.getByRole("button", { name: /^salva$/i }));

    // Il modal di conferma appare, menziona esplicitamente il nome della
    // categoria e l'effetto ("nemmeno dai master") — nessuna PATCH è ancora
    // partita.
    expect(
      await screen.findByText(
        'Disattivare questa opzione renderà "Legacy" non assegnabile a nessun personaggio, nemmeno dai master.'
      )
    ).toBeInTheDocument();
    expect(store.find(dt => dt.id === 5)?.cardinality).toBe("multi");

    // Annullando, nessuna modifica viene persistita.
    click1(screen.getByRole("button", { name: /^annulla$/i }));
    expect(store.find(dt => dt.id === 5)?.cardinality).toBe("multi");

    // Riapre e conferma: solo ora la disattivazione viene persistita.
    click1(editButtons[editButtons.length - 1]);
    click1(screen.getByRole("button", { name: /^salva$/i }));
    await screen.findByText(/non assegnabile a nessun personaggio/i);
    click1(screen.getByRole("button", { name: /^disattiva$/i }));

    await waitFor(() =>
      expect(screen.getByText("Tipo di dato aggiornato")).toBeInTheDocument()
    );
    const updated = store.find(dt => dt.id === 5);
    expect(updated?.assignability).toBe("none");
    expect(updated?.cardinality).toBeNull();
  });

  it("un head_master crea un nuovo tipo di dato dalla UI e lo vede comparire in lista dopo il refresh", async () => {
    renderManager();
    await screen.findByText("Razze");

    click1(screen.getByRole("button", { name: /nuovo tipo di dato/i }));
    const dialog = await screen.findByRole("dialog");

    const nameInput = await getNameInput(dialog);
    // Nome distinto dalla fixture "Fazioni" già in store (id 2), per non
    // confondere l'assert di comparsa con una voce già presente.
    fireEvent.change(nameInput, { target: { value: "Sette Segrete" } });
    // FieldText propaga il valore solo dopo il proprio debounce (500ms).
    await new Promise(resolve => setTimeout(resolve, 600));

    // Il field "Mostra in sidebar" è un select custom (`FieldSelect`, non un
    // vero `<select>`): si apre cliccando il valore corrente mostrato ("No")
    // e si sceglie "Sì" dal popover, stesso pattern già usato sopra per
    // "kind"/"assignability".
    click1(within(dialog).getByText("No"));
    click1(await screen.findByRole("button", { name: /^sì$/i }));
    click1(screen.getByRole("button", { name: /^crea$/i }));

    await waitFor(() =>
      expect(screen.getByText("Tipo di dato creato")).toBeInTheDocument()
    );

    // Il refetch dopo il successo aggiorna la lista con l'elemento creato:
    // stesso ordinamento (`sidebarOrder` asc, poi nome) che T-020 usa per
    // popolare `SidePanel`.
    expect(await screen.findByText("Sette Segrete")).toBeInTheDocument();
    expect(store.some(dt => dt.name === "Sette Segrete")).toBe(true);
  });

  it("un head_master modifica name/sidebarShow/sidebarOrder/icon di un tipo di dato esistente; kind resta disabilitato quando la presentazione non è 'catalog'", async () => {
    renderManager();
    await screen.findByText("Documenti Regolamento");

    // Apre l'edit dalla riga "Documenti Regolamento" (icona matita).
    const editButtons = screen.getAllByRole("button", { name: "tune" });
    click1(editButtons[editButtons.length - 1]);

    expect(
      await screen.findByText("Modifica tipo di dato")
    ).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");

    // `kind` è visibile ma disabilitato: "Documenti Regolamento" ha
    // `renderAs: "files"`, e la Tipologia ha senso solo per una
    // presentazione "catalog" (indipendentemente dal fatto che `kind` sia
    // ora modificabile in generale — vedi test dedicato sotto). Il click
    // sul field non apre il popover con le altre opzioni.
    const kindLabel = await within(dialog).findByText("Generico");
    const kindField = kindLabel.closest("div[class*='cursor-not-allowed']");
    expect(kindField).not.toBeNull();
    fireEvent.click(kindLabel);
    expect(within(dialog).queryByText("Origine")).not.toBeInTheDocument();

    const nameInput = await screen.findByDisplayValue("Documenti Regolamento");
    fireEvent.change(nameInput, {
      target: { value: "Documenti Regolamento Aggiornati" },
    });
    await new Promise(resolve => setTimeout(resolve, 600));

    // Il field "Mostra in sidebar" è un select custom (`FieldSelect`, non un
    // vero `<select>`): si apre cliccando il valore corrente mostrato ("No")
    // e si sceglie "Sì" dal popover, stesso pattern già usato sopra per
    // "kind".
    click1(within(dialog).getByText("No"));
    click1(await screen.findByRole("button", { name: /^sì$/i }));
    click1(screen.getByRole("button", { name: /^salva$/i }));

    await waitFor(() =>
      expect(screen.getByText("Tipo di dato aggiornato")).toBeInTheDocument()
    );

    const updated = store.find(dt => dt.id === 3);
    expect(updated?.name).toBe("Documenti Regolamento Aggiornati");
    expect(updated?.sidebarShow).toBe(true);
    // `kind` non è stato toccato (field disabilitato): non compare nel body
    // inviato dal form, resta invariato.
    expect(updated?.kind).toBe("generic");
  });

  // `kind` è ora modificabile in edit per le categorie con presentazione
  // "catalog" diverse da "talent" (vedi fix del bug segnalato: cambiare
  // Tipologia in modifica veniva accettato dalla UI ma rifiutato dal server,
  // perché il valore non veniva mai incluso nel body del PATCH). "Razze" (id
  // 1) non ha ancora voci di catalogo (`_count.referenceData: 0`), quindi il
  // cambio è consentito anche lato server (guard sul conteggio, vedi
  // `route.test.ts`).
  it("un head_master cambia la Tipologia di una categoria in modifica, e il nuovo kind viene inviato nel PATCH", async () => {
    renderManager();
    await screen.findByText("Razze");

    const editButtons = screen.getAllByRole("button", { name: "tune" });
    click1(editButtons[0]); // "Razze" (kind: origins)

    const dialog = await screen.findByRole("dialog");

    // Il field non è più disabilitato: il click apre il popover con le
    // altre opzioni di kind.
    const kindLabel = await within(dialog).findByText("Origine");
    const kindField = kindLabel.closest("div[class*='cursor-not-allowed']");
    expect(kindField).toBeNull();

    click1(kindLabel);
    // Vedi commento nel test precedente per il match su due occorrenze
    // consecutive di "Assegnabile" (disambigua dal bottone "Origine", il
    // cui sottotitolo contiene anch'esso quella parola).
    click1(
      await screen.findByRole("button", {
        name: /\bAssegnabile Assegnabile\b/,
      })
    );
    click1(screen.getByRole("button", { name: /^salva$/i }));

    await waitFor(() =>
      expect(screen.getByText("Tipo di dato aggiornato")).toBeInTheDocument()
    );

    const updated = store.find(dt => dt.id === 1);
    expect(updated?.kind).toBe("assignable");
  });

  it("attiva/disattiva sidebarShow direttamente dalla lista, senza aprire il form di edit", async () => {
    renderManager();
    await screen.findByText("Documenti Regolamento");

    const toggles = screen.getAllByRole("button", { name: /sidebar/i });
    // "Documenti Regolamento" è l'unico non ancora in sidebar.
    click1(toggles[toggles.length - 1]);

    await waitFor(() => {
      const updated = store.find(dt => dt.id === 3);
      expect(updated?.sidebarShow).toBe(true);
      // Prima promozione: l'ordine è assegnato in coda (2 elementi già in
      // sidebar, id 1 e 2).
      expect(updated?.sidebarOrder).toBe(2);
    });
  });

  it("riordina la sidebar con le frecce su/giù, aggiornando sidebarOrder via PATCH", async () => {
    renderManager();
    await screen.findByText("Fazioni");

    // "Fazioni" è la seconda voce in sidebar (sidebarOrder 1): "sposta su"
    // la scambia con "Razze" (sidebarOrder 0).
    const upButtons = screen.getAllByRole("button", {
      name: "keyboard_arrow_up",
    });
    click1(upButtons[upButtons.length - 1]);

    await waitFor(() => {
      const razze = store.find(dt => dt.id === 1);
      const talenti = store.find(dt => dt.id === 2);
      expect(talenti?.sidebarOrder).toBe(0);
      expect(razze?.sidebarOrder).toBe(1);
    });
  });

  // Il pulsante di eliminazione non è più direttamente in lista (rischio di
  // click accidentale): per eliminare bisogna prima aprire "Modifica" e da
  // lì cliccare "Elimina" nell'header del modal, che apre la conferma
  // esplicita (`ModalDeleteDataType`) — un passaggio in più a protezione da
  // cancellazioni per errore.
  const openDeleteConfirmFrom = async (rowName: string) => {
    const editButtons = screen.getAllByRole("button", { name: "tune" });
    const rows = screen.getAllByTestId(/^data-type-row-/);
    const rowIdx = rows.findIndex(row => within(row).queryByText(rowName));
    click1(editButtons[rowIdx]);
    const dialog = await screen.findByText("Modifica tipo di dato");
    const dialogRoot = dialog.closest<HTMLElement>('[role="dialog"]');
    if (!dialogRoot) throw new Error('Nessun elemento [role="dialog"] trovato');
    click1(
      within(dialogRoot).getByRole("button", {
        name: /^elimina$/i,
      })
    );
  };

  it("un head_master elimina un tipo di dato", async () => {
    renderManager();
    await screen.findByText("Razze");

    await openDeleteConfirmFrom("Razze");

    expect(await screen.findByText("Elimina tipo di dato")).toBeInTheDocument();
    click1(screen.getByRole("button", { name: /^elimina$/i }));

    await waitFor(() =>
      expect(screen.getByText("Tipo di dato eliminato")).toBeInTheDocument()
    );
    expect(store.some(dt => dt.id === 1)).toBe(false);
  });

  it("il testo di conferma menziona esplicitamente la cancellazione a cascata delle voci di catalogo collegate", async () => {
    renderManager();
    await screen.findByText("Fazioni");

    // "Fazioni" (id 2) ha 3 ReferenceData collegate (`_count.referenceData`).
    await openDeleteConfirmFrom("Fazioni");

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    // Il contenuto del modal viene montato con un frame di ritardo (vedi
    // Modal.tsx, "fix modal animation"): `findByText` invece di `getByText`.
    expect(
      await screen.findByText(
        "Verranno eliminate anche a cascata le 3 voci di catalogo collegate."
      )
    ).toBeInTheDocument();
  });

  it("blocca con 409 la eliminazione di un tipo di dato con almeno una voce assegnata a un personaggio (T-036), mostrando il motivo reale nel modal", async () => {
    assignedCharacterDataStore[2] = 1; // "Fazioni" ha una voce assegnata

    renderManager();
    await screen.findByText("Fazioni");

    await openDeleteConfirmFrom("Fazioni");
    click1(await screen.findByRole("button", { name: /^elimina$/i }));

    // Il toast mostra il messaggio reale del server (non un errore generico).
    expect(
      await screen.findByText(
        "Impossibile eliminare: una o più voci di questa categoria sono assegnate a dei personaggi"
      )
    ).toBeInTheDocument();
    // Il modal di conferma resta aperto e riflette lo stesso motivo.
    expect(
      screen.getByText(
        "Motivo: Impossibile eliminare: una o più voci di questa categoria sono assegnate a dei personaggi"
      )
    ).toBeInTheDocument();
    // Nessuna cancellazione a cascata: il tipo di dato resta in lista.
    expect(store.some(dt => dt.id === 2)).toBe(true);
  });

  it("se la DELETE viene rifiutata dall'API, mostra un errore leggibile invece di un crash silenzioso", async () => {
    server.use(
      http.delete("/api/campaigns/:campaignSlug/data-types/:id", () =>
        HttpResponse.json(
          {
            error: "Impossibile eliminare: ci sono voci di catalogo collegate",
          },
          { status: 409 }
        )
      )
    );

    renderManager();
    await screen.findByText("Razze");

    await openDeleteConfirmFrom("Razze");
    click1(await screen.findByRole("button", { name: /^elimina$/i }));

    expect(
      await screen.findByText(
        "Impossibile eliminare: ci sono voci di catalogo collegate"
      )
    ).toBeInTheDocument();
    // Il componente resta montato e coerente: nessun crash, la voce non è
    // stata rimossa dalla UI (l'API ha rifiutato l'operazione).
    expect(screen.getByText("Razze")).toBeInTheDocument();
  });
});
