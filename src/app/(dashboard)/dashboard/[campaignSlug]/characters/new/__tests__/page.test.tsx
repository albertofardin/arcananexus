import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { notFound } from "next/navigation";
import {
  DataCardinality,
  DataTypeAssignability,
  DataTypeKind,
  DataVisibility,
} from "@prisma/client";
// vi.mock è hoisted sopra gli import: importare qui i moduli mockati è sicuro
import NewCharacterPage from "../page";
import { auth } from "@/lib/auth";
import {
  isUserCampaignMaster,
  isUserCampaignHelper,
} from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { listDataTypes } from "@/lib/repositories/dataType.repository";
import { listReferenceDataForCampaignWithVisibility } from "@/lib/repositories/referenceData.repository";
import { listRequirementsForCampaign } from "@/lib/repositories/dataRequirement.repository";
import { getFeatureByFunctionName } from "@/lib/repositories/feature.repository";
import {
  mockCampaign,
  mockDataType,
  mockReferenceData,
} from "@/test/helpers/prisma-fixtures";

// Mock next/navigation - notFound should throw to stop execution
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}));

// Mock auth module
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

// Mock prisma (non usato direttamente: passato ai repository mockati)
vi.mock("@/lib/db", () => ({
  prisma: {},
}));

// Mock authorization helpers
vi.mock("@/lib/authorization", () => ({
  isUserCampaignMaster: vi.fn(),
  isUserCampaignHelper: vi.fn(),
}));

// Mock repository
vi.mock("@/lib/repositories/campaign.repository", () => ({
  getCampaignBySlug: vi.fn(),
}));
vi.mock("@/lib/repositories/dataType.repository", () => ({
  listDataTypes: vi.fn(),
}));
vi.mock("@/lib/repositories/referenceData.repository", () => ({
  listReferenceDataForCampaignWithVisibility: vi.fn(),
}));
vi.mock("@/lib/repositories/dataRequirement.repository", () => ({
  listRequirementsForCampaign: vi.fn(),
}));
vi.mock("@/lib/repositories/feature.repository", () => ({
  getFeatureByFunctionName: vi.fn(),
}));

// `filterVisible`/il registry non sono mockati: il test verifica il
// comportamento reale end-to-end (regola CLAUDE.md: visibilità server-side).

describe("New Character Page", () => {
  const mockParams = { campaignSlug: "test-campaign" };
  const campaign = mockCampaign();

  beforeEach(() => {
    vi.clearAllMocks();
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "user@example.com" },
    });
    (getCampaignBySlug as Mock).mockResolvedValue(campaign);
    (isUserCampaignMaster as Mock).mockResolvedValue(false);
    (isUserCampaignHelper as Mock).mockResolvedValue(false);
    (listDataTypes as Mock).mockResolvedValue([]);
    (listReferenceDataForCampaignWithVisibility as Mock).mockResolvedValue([]);
    (listRequirementsForCampaign as Mock).mockResolvedValue([]);
    (getFeatureByFunctionName as Mock).mockResolvedValue(null);
  });

  it("calls notFound when the user is not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    await expect(
      NewCharacterPage({ params: Promise.resolve(mockParams) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("calls notFound when the campaign does not exist", async () => {
    (getCampaignBySlug as Mock).mockResolvedValue(null);

    await expect(
      NewCharacterPage({ params: Promise.resolve(mockParams) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  describe("Visibility enforcement (T-037)", () => {
    const talenti = mockDataType({
      id: 10,
      name: "Talenti",
      kind: DataTypeKind.generic,
      cardinality: DataCardinality.multi,
      assignability: DataTypeAssignability.always,
    });

    beforeEach(() => {
      (listDataTypes as Mock).mockResolvedValue([talenti]);
    });

    it("hides a `hidden` ReferenceData from an ordinary player", async () => {
      (listReferenceDataForCampaignWithVisibility as Mock).mockResolvedValue([
        mockReferenceData({
          id: 1,
          dataTypeId: talenti.id,
          name: "Talento Comune",
          visibility: DataVisibility.visible,
        }),
        mockReferenceData({
          id: 2,
          dataTypeId: talenti.id,
          name: "Talento Segreto",
          visibility: DataVisibility.hidden,
        }),
      ]);

      const result = await NewCharacterPage({
        params: Promise.resolve(mockParams),
      });
      const html = JSON.stringify(result);

      expect(html).toContain("Talento Comune");
      expect(html).not.toContain("Talento Segreto");
    });

    it("hides a `hidden` ReferenceData even with a visibleWith arc, since creation has no ownedData yet (T-050)", async () => {
      (listReferenceDataForCampaignWithVisibility as Mock).mockResolvedValue([
        mockReferenceData({
          id: 3,
          dataTypeId: talenti.id,
          name: "Fazione del Culto",
          visibility: DataVisibility.hidden,
        }),
      ]);

      const result = await NewCharacterPage({
        params: Promise.resolve(mockParams),
      });

      // In creazione non esiste ancora un PG/CharacterData posseduta, e la
      // pagina di creazione non risolve archi `visibleWith` (unico consumer
      // reale: `characterTalents.service.ts`) — una voce `hidden` resta
      // sempre nascosta qui.
      expect(JSON.stringify(result)).not.toContain("Fazione del Culto");
    });

    it("shows the entire catalog, including hidden/conditioned entries, to a campaign master", async () => {
      (isUserCampaignMaster as Mock).mockResolvedValue(true);
      (isUserCampaignHelper as Mock).mockResolvedValue(true);
      (listReferenceDataForCampaignWithVisibility as Mock).mockResolvedValue([
        mockReferenceData({
          id: 2,
          dataTypeId: talenti.id,
          name: "Talento Segreto",
          visibility: DataVisibility.hidden,
        }),
      ]);

      const result = await NewCharacterPage({
        params: Promise.resolve(mockParams),
      });

      expect(JSON.stringify(result)).toContain("Talento Segreto");
    });

    it("does not bypass catalog visibility for a user without a campaign grant, even if they are super-admin (isSuperAdmin bypass rimosso)", async () => {
      (isUserCampaignMaster as Mock).mockResolvedValue(false);
      (listReferenceDataForCampaignWithVisibility as Mock).mockResolvedValue([
        mockReferenceData({
          id: 2,
          dataTypeId: talenti.id,
          name: "Talento Segreto",
          visibility: DataVisibility.hidden,
        }),
      ]);

      const result = await NewCharacterPage({
        params: Promise.resolve(mockParams),
      });

      expect(JSON.stringify(result)).not.toContain("Talento Segreto");
    });

    it("only derives the requirement graph from entries that remain visible after filtering", async () => {
      (listReferenceDataForCampaignWithVisibility as Mock).mockResolvedValue([
        mockReferenceData({
          id: 1,
          dataTypeId: talenti.id,
          name: "Talento Base",
          visibility: DataVisibility.visible,
        }),
        mockReferenceData({
          id: 2,
          dataTypeId: talenti.id,
          name: "Talento Segreto",
          visibility: DataVisibility.hidden,
        }),
      ]);
      (listRequirementsForCampaign as Mock).mockResolvedValue([
        { id: 100, definitionId: 1, requiredDefinitionId: 2, type: "requires" },
      ]);

      const result = await NewCharacterPage({
        params: Promise.resolve(mockParams),
      });

      // Il requisito punta a un id (2) non più visibile dopo il filtro:
      // non deve comparire nel grafo passato al form.
      expect(JSON.stringify(result)).not.toContain('"requirements":[{');
    });
  });

  // T-035: `cardinality: null` (es. "Regolamenti") è un vincolo strutturale
  // — nessuna istanza è mai assegnabile a un PG — non un gate di permesso
  // bypassabile in vista master, a differenza di `assignability`.
  describe("Categorie non assegnabili (T-035)", () => {
    const regolamenti = mockDataType({
      id: 20,
      name: "Regolamenti",
      kind: DataTypeKind.generic,
      cardinality: null,
      assignability: DataTypeAssignability.none,
    });

    beforeEach(() => {
      (listDataTypes as Mock).mockResolvedValue([regolamenti]);
      (listReferenceDataForCampaignWithVisibility as Mock).mockResolvedValue([
        mockReferenceData({
          id: 1,
          dataTypeId: regolamenti.id,
          name: "Regolamento di Ambientazione",
          visibility: DataVisibility.visible,
        }),
      ]);
    });

    it("excludes a cardinality: null DataType from the ordinary player's creation catalog", async () => {
      const result = await NewCharacterPage({
        params: Promise.resolve(mockParams),
      });

      expect(JSON.stringify(result)).not.toContain(
        "Regolamento di Ambientazione"
      );
    });

    it("excludes a cardinality: null DataType even in master view (not a permission gate)", async () => {
      (isUserCampaignMaster as Mock).mockResolvedValue(true);

      const result = await NewCharacterPage({
        params: Promise.resolve(mockParams),
      });

      expect(JSON.stringify(result)).not.toContain(
        "Regolamento di Ambientazione"
      );
    });
  });

  // T-041 (correzione owner, sostituisce il describe T-035 rimosso): un
  // talento non `creationOnly` è proposto nel catalogo di creazione PG
  // esattamente come qualunque altro talento — "Talenti" si comporta come
  // qualunque altra categoria assegnabile, nessun filtro aggiuntivo per il
  // giocatore ordinario.
  describe("Talenti nel catalogo di creazione (T-041)", () => {
    const talenti = mockDataType({
      id: 30,
      name: "Talenti",
      kind: DataTypeKind.talent,
      cardinality: DataCardinality.multi,
      assignability: DataTypeAssignability.always,
    });

    beforeEach(() => {
      (listDataTypes as Mock).mockResolvedValue([talenti]);
      (listReferenceDataForCampaignWithVisibility as Mock).mockResolvedValue([
        mockReferenceData({
          id: 1,
          dataTypeId: talenti.id,
          name: "Lama del Veterano",
          visibility: DataVisibility.visible,
          flags: { creationOnly: true },
        }),
        mockReferenceData({
          id: 2,
          dataTypeId: talenti.id,
          name: "Fendente Implacabile",
          visibility: DataVisibility.visible,
          flags: { creationOnly: false },
        }),
      ]);
    });

    it("proposes every talent (creationOnly or not) to an ordinary player", async () => {
      const result = await NewCharacterPage({
        params: Promise.resolve(mockParams),
      });
      const html = JSON.stringify(result);

      expect(html).toContain("Lama del Veterano");
      expect(html).toContain("Fendente Implacabile");
    });

    it("proposes every talent in master view too", async () => {
      (isUserCampaignMaster as Mock).mockResolvedValue(true);

      const result = await NewCharacterPage({
        params: Promise.resolve(mockParams),
      });
      const html = JSON.stringify(result);

      expect(html).toContain("Lama del Veterano");
      expect(html).toContain("Fendente Implacabile");
    });

    it("still proposes every talent when a master previews the player view (?view=player)", async () => {
      (isUserCampaignMaster as Mock).mockResolvedValue(true);
      (isUserCampaignHelper as Mock).mockResolvedValue(true);

      const result = await NewCharacterPage({
        params: Promise.resolve(mockParams),
      });
      const html = JSON.stringify(result);

      expect(html).toContain("Lama del Veterano");
      expect(html).toContain("Fendente Implacabile");
    });
  });

  // T-0xx: `CatalogDataType.masterOnly` (calcolato in `page.tsx`, mostrato da
  // `CharacterCreation.tsx` come badge "Solo Master") segnala allo staff che
  // un campo del form non sarà mai visibile a un giocatore ordinario — un
  // `DataType` `assignability: masterOnly` o `visibility: hidden`. Un
  // giocatore ordinario non vede mai `masterOnly: true`: quei `DataType` sono
  // già esclusi a monte dal suo catalogo (vedi "Visibility enforcement"), non
  // solo marcati.
  describe("Campo masterOnly nel catalogo di creazione (T-0xx)", () => {
    it("flags masterOnly: true for a masterOnly-assignability DataType, visible only to staff", async () => {
      (isUserCampaignMaster as Mock).mockResolvedValue(true);
      (isUserCampaignHelper as Mock).mockResolvedValue(true);
      (listDataTypes as Mock).mockResolvedValue([
        mockDataType({
          id: 40,
          name: "Malattie strane",
          kind: DataTypeKind.assignable,
          cardinality: DataCardinality.single,
          assignability: DataTypeAssignability.masterOnly,
          visibility: DataVisibility.visible,
        }),
      ]);
      (listReferenceDataForCampaignWithVisibility as Mock).mockResolvedValue([
        mockReferenceData({
          id: 1,
          dataTypeId: 40,
          name: "Peste dell'Abisso",
          visibility: DataVisibility.visible,
        }),
      ]);

      const result = await NewCharacterPage({
        params: Promise.resolve(mockParams),
      });
      const html = JSON.stringify(result);

      expect(html).toContain("Malattie strane");
      expect(html).toContain('"masterOnly":true');
    });

    it("flags masterOnly: true for a hidden-visibility DataType (assignability: always), visible only to staff", async () => {
      (isUserCampaignMaster as Mock).mockResolvedValue(true);
      (isUserCampaignHelper as Mock).mockResolvedValue(true);
      (listDataTypes as Mock).mockResolvedValue([
        mockDataType({
          id: 41,
          name: "Morte segreta",
          kind: DataTypeKind.assignable,
          cardinality: DataCardinality.single,
          assignability: DataTypeAssignability.always,
          visibility: DataVisibility.hidden,
        }),
      ]);
      (listReferenceDataForCampaignWithVisibility as Mock).mockResolvedValue([
        mockReferenceData({
          id: 2,
          dataTypeId: 41,
          name: "Veleno lento",
          visibility: DataVisibility.visible,
        }),
      ]);

      const result = await NewCharacterPage({
        params: Promise.resolve(mockParams),
      });
      const html = JSON.stringify(result);

      expect(html).toContain("Morte segreta");
      expect(html).toContain('"masterOnly":true');
    });

    it("flags masterOnly: false for an ordinary visible/always-assignable DataType", async () => {
      (isUserCampaignMaster as Mock).mockResolvedValue(true);
      (isUserCampaignHelper as Mock).mockResolvedValue(true);
      (listDataTypes as Mock).mockResolvedValue([
        mockDataType({
          id: 42,
          name: "Costellazione",
          kind: DataTypeKind.assignable,
          cardinality: DataCardinality.single,
          assignability: DataTypeAssignability.always,
          visibility: DataVisibility.visible,
        }),
      ]);
      (listReferenceDataForCampaignWithVisibility as Mock).mockResolvedValue([
        mockReferenceData({
          id: 3,
          dataTypeId: 42,
          name: "Bilancia",
          visibility: DataVisibility.visible,
        }),
      ]);

      const result = await NewCharacterPage({
        params: Promise.resolve(mockParams),
      });
      const html = JSON.stringify(result);

      expect(html).toContain("Costellazione");
      expect(html).toContain('"masterOnly":false');
      expect(html).not.toContain('"masterOnly":true');
    });
  });
});
