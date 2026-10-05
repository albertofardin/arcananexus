import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import * as React from "react";
import {
  CharacterType,
  DataCardinality,
  DataTypeAssignability,
  DataTypeKind,
  DataVisibility,
} from "@prisma/client";
import { useCharacterEditorDraft } from "../useCharacterEditorDraft";
import type {
  CharacterDataGroup,
  CharacterEditorValue,
} from "../CharacterEditor";
import ToastProvider from "@/components/_core/Toast";
import {
  mockCharacterData,
  mockDataType,
  mockReferenceData,
} from "@/test/helpers/prisma-fixtures";

const baseInitial: CharacterEditorValue = {
  name: "Test",
  type: CharacterType.pg,
  background: "",
  playerNotes: "",
  masterPublicNotes: "",
  masterNotes: "",
  approvalDate: "2024-01-01",
  deathDate: "",
  parkDate: "",
};

function buildGroup({
  dataTypeId,
  cardinality,
  entries = [],
}: {
  dataTypeId: number;
  cardinality: DataCardinality;
  entries?: { characterDataId: number; referenceDataId: number }[];
}): CharacterDataGroup {
  return {
    dataType: {
      id: dataTypeId,
      name: `DataType ${dataTypeId}`,
      icon: "star",
      kind: DataTypeKind.assignable,
      cardinality,
      assignability: DataTypeAssignability.always,
      visibility: DataVisibility.visible,
    },
    entries: entries.map(entry => ({
      ...mockCharacterData({
        id: entry.characterDataId,
        characterId: 1,
        dataTypeId,
        referenceDataId: entry.referenceDataId,
      }),
      dataType: mockDataType({ id: dataTypeId }),
      referenceData: mockReferenceData({
        id: entry.referenceDataId,
        dataTypeId,
      }),
    })),
  };
}

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(ToastProvider, null, children);

function setupDraft(
  overrides: Partial<Parameters<typeof useCharacterEditorDraft>[0]> = {}
) {
  return renderHook(
    () =>
      useCharacterEditorDraft({
        characterId: 1,
        campaignSlug: "test-campaign",
        initial: baseInitial,
        isMaster: false,
        viewingAsMaster: false,
        isOwner: false,
        characterDataGroups: [],
        acquirableTalents: [],
        talentRequirements: [],
        ownedReferenceDataIds: [],
        xpBalance: null,
        ...overrides,
      }),
    { wrapper }
  );
}

// T-0xx: "Player View" deve mostrare (ed editare) la scheda esattamente
// come la vedrebbe il proprietario reale — anche quando il master sta
// guardando il personaggio di un altro giocatore, non solo il proprio.
describe("useCharacterEditorDraft — canEdit", () => {
  it("il master in Master View può sempre editare", () => {
    const { result } = setupDraft({
      isMaster: true,
      viewingAsMaster: true,
      isOwner: false,
    });

    expect(result.current.canEdit).toBe(true);
  });

  it("il master in Player View (preview) può editare come farebbe il proprietario, anche su un personaggio altrui", () => {
    const { result } = setupDraft({
      isMaster: true,
      viewingAsMaster: false,
      isOwner: false,
    });

    expect(result.current.canEdit).toBe(true);
  });

  it("il master in Player View NON può editare un personaggio non approvato, come un proprietario reale", () => {
    const { result } = setupDraft({
      isMaster: true,
      viewingAsMaster: false,
      isOwner: false,
      initial: { ...baseInitial, approvalDate: "" },
    });

    expect(result.current.canEdit).toBe(false);
  });

  it("il proprietario reale (non master) può editare il proprio personaggio approvato", () => {
    const { result } = setupDraft({
      isMaster: false,
      viewingAsMaster: false,
      isOwner: true,
    });

    expect(result.current.canEdit).toBe(true);
  });

  it("il proprietario reale non può editare un personaggio non ancora approvato", () => {
    const { result } = setupDraft({
      isMaster: false,
      viewingAsMaster: false,
      isOwner: true,
      initial: { ...baseInitial, approvalDate: "" },
    });

    expect(result.current.canEdit).toBe(false);
  });

  it("chi non è né master né proprietario resta sempre in sola lettura", () => {
    const { result } = setupDraft({
      isMaster: false,
      viewingAsMaster: false,
      isOwner: false,
    });

    expect(result.current.canEdit).toBe(false);
  });
});

describe("useCharacterEditorDraft — saveOriginsDiff", () => {
  // Bug fix T-0xx: cardinalità `single` sostituisce SEMPRE l'assegnazione
  // esistente lato server (`deleteCharacterDataByDataType`, dentro la POST
  // stessa) — una DELETE esplicita sulla entry precedente arriverebbe su una
  // riga già sparita (404, o 403 per un self-assign giocatore, la DELETE è
  // riservata al master) e romperebbe il salvataggio.
  it("una sostituzione a cardinalità singola invia solo la POST, nessuna DELETE ridondante", async () => {
    const group = buildGroup({
      dataTypeId: 10,
      cardinality: DataCardinality.single,
      entries: [{ characterDataId: 500, referenceDataId: 1 }],
    });
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ characterData: { id: 501 } }), {
        status: 201,
      })
    );

    const { result } = setupDraft({
      isMaster: true,
      viewingAsMaster: true,
      characterDataGroups: [group],
    });

    act(() => result.current.patchOriginSelection(10, [2]));
    await act(async () => {
      await result.current.handleSave();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/campaigns/test-campaign/characters/1/data",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("azzerare la selezione a cardinalità singola invia la DELETE sulla entry esistente", async () => {
    const group = buildGroup({
      dataTypeId: 11,
      cardinality: DataCardinality.single,
      entries: [{ characterDataId: 600, referenceDataId: 5 }],
    });
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    const { result } = setupDraft({
      isMaster: true,
      viewingAsMaster: true,
      characterDataGroups: [group],
    });

    act(() => result.current.patchOriginSelection(11, []));
    await act(async () => {
      await result.current.handleSave();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/campaigns/test-campaign/characters/1/data/600",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  // T-0xx: l'icona occhio in bozza (`DraftVisibilityToggle`, campo ancora
  // senza `CharacterData`) non fa alcuna chiamata di rete da sola — viene
  // solo inclusa come `visibility` esplicita nella POST della successiva
  // assegnazione.
  it("una nuova assegnazione include la visibilità scelta in bozza nel body della POST", async () => {
    const group = buildGroup({
      dataTypeId: 12,
      cardinality: DataCardinality.single,
      entries: [],
    });
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ characterData: { id: 700 } }), {
        status: 201,
      })
    );

    const { result } = setupDraft({
      isMaster: true,
      viewingAsMaster: true,
      characterDataGroups: [group],
    });

    act(() => {
      result.current.patchOriginVisibility(12, DataVisibility.hidden);
      result.current.patchOriginSelection(12, [9]);
    });
    await act(async () => {
      await result.current.handleSave();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/campaigns/test-campaign/characters/1/data",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ referenceDataId: 9, visibility: "hidden" }),
      })
    );
  });

  it("la visibilità di bozza si resetta dopo il salvataggio e non viene reinviata in un salvataggio successivo", async () => {
    const group = buildGroup({
      dataTypeId: 13,
      cardinality: DataCardinality.single,
      entries: [],
    });
    let created = 800;
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async () => {
      created += 1;
      return new Response(JSON.stringify({ characterData: { id: created } }), {
        status: 201,
      });
    });

    const { result } = setupDraft({
      isMaster: true,
      viewingAsMaster: true,
      characterDataGroups: [group],
    });

    act(() => {
      result.current.patchOriginVisibility(13, DataVisibility.hidden);
      result.current.patchOriginSelection(13, [20]);
    });
    await act(async () => {
      await result.current.handleSave();
    });

    // Seconda modifica, senza toccare di nuovo la visibilità di bozza: se il
    // reset non scattasse, questa seconda POST porterebbe ancora
    // `visibility: "hidden"` anche se il master non l'ha più scelto.
    act(() => result.current.patchOriginSelection(13, [21]));
    await act(async () => {
      await result.current.handleSave();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const secondCallInit = fetchSpy.mock.calls[1]?.[1];
    expect(JSON.parse(secondCallInit?.body as string)).toEqual({
      referenceDataId: 21,
    });
  });
});

// T-0xx: un talento `repeatable` può essere scelto più di una volta nella
// stessa bozza (fino a `flags.maxRepetitions`, imposto lato server) — lo
// stato passa da un `Set` a un conteggio per id.
describe("useCharacterEditorDraft — talentDraftCounts", () => {
  const repeatableTalent = {
    id: 30,
    name: "Talento ripetibile",
    description: null,
    visibility: DataVisibility.visible,
    flags: { cost: 5, repeatable: true, maxRepetitions: 3 },
  };

  it("incrementTalentDraft accumula selezioni multiple dello stesso talento (costo e dirty scalano col conteggio)", () => {
    const { result } = setupDraft({ acquirableTalents: [repeatableTalent] });

    act(() => result.current.incrementTalentDraft(repeatableTalent.id));
    act(() => result.current.incrementTalentDraft(repeatableTalent.id));

    expect(result.current.talentDraftCounts.get(repeatableTalent.id)).toBe(2);
    expect(result.current.draftXpAvailable).toBe(-10);
    expect(result.current.dirty).toBe(true);
  });

  it("decrementTalentDraft riduce il conteggio e lo rimuove del tutto a zero", () => {
    const { result } = setupDraft({ acquirableTalents: [repeatableTalent] });

    act(() => result.current.incrementTalentDraft(repeatableTalent.id));
    act(() => result.current.incrementTalentDraft(repeatableTalent.id));
    act(() => result.current.decrementTalentDraft(repeatableTalent.id));

    expect(result.current.talentDraftCounts.get(repeatableTalent.id)).toBe(1);

    act(() => result.current.decrementTalentDraft(repeatableTalent.id));

    expect(result.current.talentDraftCounts.has(repeatableTalent.id)).toBe(
      false
    );
    expect(result.current.dirty).toBe(false);
  });

  it("il salvataggio invia una POST per ciascuna ripetizione dello stesso talento in bozza", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ characterData: { id: 1 } }), {
        status: 201,
      })
    );
    const { result } = setupDraft({
      acquirableTalents: [repeatableTalent],
      xpBalance: { earned: 100, available: 100 },
    });

    act(() => result.current.incrementTalentDraft(repeatableTalent.id));
    act(() => result.current.incrementTalentDraft(repeatableTalent.id));
    await act(async () => {
      await result.current.handleSave();
    });

    const talentCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).endsWith("/actions")
    );
    expect(talentCalls).toHaveLength(2);
    for (const [, init] of talentCalls) {
      expect(JSON.parse(init?.body as string)).toEqual({
        functionName: "progress",
        actionData: { kind: "talent", referenceDataId: repeatableTalent.id },
      });
    }
    expect(result.current.talentDraftCounts.size).toBe(0);
  });
});
