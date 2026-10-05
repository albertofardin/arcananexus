import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  DataCardinality,
  DataTypeAssignability,
  DataTypeKind,
  DataVisibility,
  type ReferenceData,
} from "@prisma/client";
import CharacterEditorAnagraphic from "../CharacterEditorAnagraphic";
import type { CharacterDataGroup } from "../CharacterEditor";
import ToastProvider from "@/components/_core/Toast";
import {
  mockCharacterData,
  mockDataType,
  mockReferenceData,
} from "@/test/helpers/prisma-fixtures";

// `Btn`/`BtnBase` distinguono singolo/doppio click da `event.detail` (1 vs
// 2) — `fireEvent.click` di jsdom lo lascia a 0 di default, ignorato in
// silenzio. Stesso accorgimento già in `CharacterCreation.test.tsx`.
const click1 = (el: HTMLElement) => fireEvent.click(el, { detail: 1 });

function renderAnagraphic(
  props: Partial<React.ComponentProps<typeof CharacterEditorAnagraphic>>
) {
  return render(
    <ToastProvider>
      <CharacterEditorAnagraphic
        characterId={1}
        campaignSlug="test-campaign"
        {...props}
      />
    </ToastProvider>
  );
}

function buildGroup({
  dataTypeId,
  name = `DataType ${dataTypeId}`,
  cardinality,
  assignability = DataTypeAssignability.always,
  visibility = DataVisibility.visible,
  entries = [],
}: {
  dataTypeId: number;
  name?: string;
  cardinality: DataCardinality;
  assignability?: DataTypeAssignability;
  visibility?: DataVisibility;
  entries?: {
    characterDataId: number;
    referenceDataId: number;
    name: string;
    description?: string | null;
    entryVisibility?: DataVisibility;
  }[];
}): CharacterDataGroup {
  return {
    dataType: {
      id: dataTypeId,
      name,
      icon: "star",
      kind: DataTypeKind.assignable,
      cardinality,
      assignability,
      visibility,
    },
    entries: entries.map(entry => ({
      ...mockCharacterData({
        id: entry.characterDataId,
        characterId: 1,
        dataTypeId,
        referenceDataId: entry.referenceDataId,
        visibility: entry.entryVisibility ?? DataVisibility.visible,
      }),
      dataType: mockDataType({ id: dataTypeId }),
      referenceData: mockReferenceData({
        id: entry.referenceDataId,
        dataTypeId,
        name: entry.name,
        description: entry.description ?? null,
      }),
    })),
  };
}

function buildCatalog(
  items: { id: number; dataTypeId: number; name: string }[]
): ReferenceData[] {
  return items.map(item =>
    mockReferenceData({
      id: item.id,
      dataTypeId: item.dataTypeId,
      name: item.name,
    })
  );
}

describe("CharacterEditorAnagraphic — master: campo mai valorizzato", () => {
  it("mostra il dropdown editabile e l'icona occhio di bozza per un campo vuoto", () => {
    const group = buildGroup({
      dataTypeId: 1,
      cardinality: DataCardinality.single,
    });

    renderAnagraphic({
      viewingAsMaster: true,
      canEdit: true,
      characterDataGroups: [group],
      originsCatalog: buildCatalog([
        { id: 10, dataTypeId: 1, name: "Bilancia" },
        { id: 11, dataTypeId: 1, name: "Vergine" },
      ]),
    });

    expect(screen.getByText("Seleziona...")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Nascosta al giocatore alla prossima assegnazione",
      })
    ).toBeInTheDocument();
  });

  it("l'icona occhio di bozza è puramente locale: cambia solo il draft, nessuna chiamata di rete", () => {
    const group = buildGroup({
      dataTypeId: 1,
      cardinality: DataCardinality.single,
    });
    const onOriginsVisibilityDraftChange = vi.fn();
    const fetchSpy = vi.spyOn(global, "fetch");

    renderAnagraphic({
      viewingAsMaster: true,
      canEdit: true,
      characterDataGroups: [group],
      originsCatalog: buildCatalog([
        { id: 10, dataTypeId: 1, name: "Bilancia" },
      ]),
      onOriginsVisibilityDraftChange,
    });

    click1(
      screen.getByRole("button", {
        name: "Nascosta al giocatore alla prossima assegnazione",
      })
    );

    expect(onOriginsVisibilityDraftChange).toHaveBeenCalledWith(
      1,
      DataVisibility.hidden
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("CharacterEditorAnagraphic — giocatore", () => {
  it("un campo con una sola entry salvata ma nascosta (icona occhio del master) non compare affatto", () => {
    const group = buildGroup({
      dataTypeId: 2,
      name: "Campo Segreto",
      cardinality: DataCardinality.single,
      assignability: DataTypeAssignability.always,
      visibility: DataVisibility.visible,
      entries: [
        {
          characterDataId: 50,
          referenceDataId: 5,
          name: "Segreto",
          entryVisibility: DataVisibility.hidden,
        },
      ],
    });

    renderAnagraphic({
      viewingAsMaster: false,
      canEdit: true,
      characterDataGroups: [group],
    });

    expect(screen.queryByText("Segreto")).not.toBeInTheDocument();
    expect(screen.queryByText("Campo Segreto")).not.toBeInTheDocument();
  });

  it("un campo con una entry visibile mostra la card statica, senza controlli di visibilità", () => {
    const group = buildGroup({
      dataTypeId: 3,
      name: "Razza",
      cardinality: DataCardinality.single,
      assignability: DataTypeAssignability.creationOnly,
      entries: [
        {
          characterDataId: 51,
          referenceDataId: 6,
          name: "Umano",
          description: "Descrizione umano",
        },
      ],
    });

    renderAnagraphic({
      viewingAsMaster: false,
      canEdit: true,
      characterDataGroups: [group],
      // La vista statica riflette la bozza `originsSelection` (non
      // `group.entries` grezzo, vedi il test sotto sulla bozza) — in
      // `CharacterEditor` reale è `useCharacterEditorDraft` a seminarla a
      // partire dalle entry salvate; qui va simulato a mano.
      originsSelection: { 3: [6] },
    });

    expect(screen.getByText("Umano")).toBeInTheDocument();
    expect(screen.getByText("Descrizione umano")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("un campo vuoto ma auto-assegnabile mostra 'Non ancora assegnato' e passa al dropdown col pulsante Modifica", () => {
    const group = buildGroup({
      dataTypeId: 4,
      cardinality: DataCardinality.single,
      assignability: DataTypeAssignability.always,
      visibility: DataVisibility.visible,
    });

    renderAnagraphic({
      viewingAsMaster: false,
      canEdit: true,
      characterDataGroups: [group],
      originsCatalog: buildCatalog([
        { id: 20, dataTypeId: 4, name: "Bilancia" },
      ]),
    });

    expect(screen.getByText("Non ancora assegnato")).toBeInTheDocument();

    click1(screen.getByRole("button", { name: "Modifica" }));

    expect(screen.getByText("Seleziona...")).toBeInTheDocument();
    expect(screen.queryByText("Non ancora assegnato")).not.toBeInTheDocument();
  });

  // Bug fix T-0xx: il master in "player view" (canEdit vero via
  // `isPreviewingAsPlayer`, viewingAsMaster falso) su un campo non auto-assegnabile
  // (es. Razza, `creationOnly`) deve vedere la bozza appena modificata in
  // master view, non il valore ancora salvato — altrimenti la modifica
  // sembrava sparire passando a "player view" senza prima salvare.
  it("un campo non auto-assegnabile riflette la selezione in bozza, non il valore salvato ancora presente", () => {
    const group = buildGroup({
      dataTypeId: 3,
      name: "Razza",
      cardinality: DataCardinality.single,
      assignability: DataTypeAssignability.creationOnly,
      entries: [{ characterDataId: 60, referenceDataId: 7, name: "Umano" }],
    });

    renderAnagraphic({
      viewingAsMaster: false,
      canEdit: true,
      characterDataGroups: [group],
      originsCatalog: buildCatalog([
        { id: 7, dataTypeId: 3, name: "Umano" },
        { id: 8, dataTypeId: 3, name: "Elfo" },
      ]),
      originsSelection: { 3: [8] },
    });

    expect(screen.getByText("Elfo")).toBeInTheDocument();
    expect(screen.queryByText("Umano")).not.toBeInTheDocument();
  });
});
