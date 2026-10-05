import * as React from "react";
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { notFound } from "next/navigation";
import {
  DataTypeAssignability,
  DataTypeKind,
  DataTypeRender,
  DataVisibility,
} from "@prisma/client";
// vi.mock è hoisted sopra gli import: importare qui i moduli mockati è sicuro
import ManagerData from "@/components/DataManager/ManagerData";
import ButtonCreateDataFile from "@/components/DataManager/ButtonCreateDataFile";
import ButtonCreateDataCatalog from "@/components/DataManager/ButtonCreateDataCatalog";
import ButtonCreateDataTalent from "@/components/DataManager/ButtonCreateDataTalent";
import ButtonExportTalentsCsv from "@/components/DataManager/ButtonExportTalentsCsv";
import ButtonImportTalentsCsv from "@/components/DataManager/ButtonImportTalentsCsv";
import ManagerDataTalents from "@/components/DataManager/ManagerDataTalents";
import HeroPage from "@/components/HeroPage";
import { EmptyCard } from "@/components/Feedback";
import { auth } from "@/lib/auth";
import {
  isUserCampaignHelper,
  isUserCampaignMaster,
} from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { getDataTypeByName } from "@/lib/repositories/dataType.repository";
import {
  listReferenceDataForDataType,
  listReferenceDataForCampaignWithVisibility,
} from "@/lib/repositories/referenceData.repository";
import { listRequirementsForCampaign } from "@/lib/repositories/dataRequirement.repository";
import { getUserCharacterInCampaign } from "@/lib/repositories/character.repository";
import { listOwnedCharacterDataInCampaign } from "@/lib/repositories/characterData.repository";
import { getFeatureByFunctionName } from "@/lib/repositories/feature.repository";
import {
  mockCampaign,
  mockCharacter,
  mockDataType,
  mockReferenceData,
  mockCharacterData,
  mockFeature,
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
  isUserCampaignHelper: vi.fn(),
  isUserCampaignMaster: vi.fn(),
}));

// Il componente client di gestione documenti (T-021) usa `useUploadThing`
// (client-only, richiede l'SDK UploadThing): non è renderizzato in questo
// Server Component test, ci basta verificare che riceva le prop corrette
// (vedi i test "Documents rendering" più sotto, che ispezionano l'albero di
// elementi via `JSON.stringify` senza montare il client component).

// Mock repository
vi.mock("@/lib/repositories/campaign.repository", () => ({
  getCampaignBySlug: vi.fn(),
}));
vi.mock("@/lib/repositories/dataType.repository", () => ({
  getDataTypeByName: vi.fn(),
}));
vi.mock("@/lib/repositories/referenceData.repository", () => ({
  listReferenceDataForDataType: vi.fn(),
  listReferenceDataForCampaignWithVisibility: vi.fn(),
}));
vi.mock("@/lib/repositories/dataRequirement.repository", () => ({
  listRequirementsForCampaign: vi.fn(),
}));
vi.mock("@/lib/repositories/character.repository", () => ({
  getUserCharacterInCampaign: vi.fn(),
}));
vi.mock("@/lib/repositories/characterData.repository", () => ({
  listOwnedCharacterDataInCampaign: vi.fn(),
}));
vi.mock("@/lib/repositories/feature.repository", () => ({
  getFeatureByFunctionName: vi.fn(),
}));

// `filterVisible`/il registry non sono mockati: il test verifica il
// comportamento reale end-to-end (regola CLAUDE.md: visibilità server-side).

describe("ManagerData", () => {
  const baseProps = { campaignSlug: "test-campaign", dataSlug: "Razze" };
  const campaign = mockCampaign();

  beforeEach(() => {
    vi.clearAllMocks();
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1", email: "user@example.com" },
    });
    (getCampaignBySlug as Mock).mockResolvedValue(campaign);
    (isUserCampaignHelper as Mock).mockResolvedValue(false);
    (isUserCampaignMaster as Mock).mockResolvedValue(false);
    (getUserCharacterInCampaign as Mock).mockResolvedValue(null);
    (listOwnedCharacterDataInCampaign as Mock).mockResolvedValue([]);
    (listReferenceDataForDataType as Mock).mockResolvedValue([]);
    (listReferenceDataForCampaignWithVisibility as Mock).mockResolvedValue([]);
    (listRequirementsForCampaign as Mock).mockResolvedValue([]);
  });

  it("calls notFound when the user is not authenticated", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    await expect(ManagerData(baseProps)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("calls notFound when the campaign does not exist", async () => {
    (getCampaignBySlug as Mock).mockResolvedValue(null);

    await expect(ManagerData(baseProps)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("calls notFound when no DataType matches the decoded slug", async () => {
    (getDataTypeByName as Mock).mockResolvedValue(null);

    await expect(ManagerData(baseProps)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getDataTypeByName).toHaveBeenCalledWith(
      expect.anything(),
      campaign.id,
      "Razze"
    );
  });

  it("decodes the dataSlug before looking up the DataType", async () => {
    (getDataTypeByName as Mock).mockResolvedValue(
      mockDataType({ sidebarShow: true })
    );

    await ManagerData({
      campaignSlug: "test-campaign",
      dataSlug: "Culto%20del%20Serpente",
    });

    expect(getDataTypeByName).toHaveBeenCalledWith(
      expect.anything(),
      campaign.id,
      "Culto del Serpente"
    );
  });

  it("calls notFound when the DataType is not promoted to the sidebar, for a non-master viewer", async () => {
    (getDataTypeByName as Mock).mockResolvedValue(
      mockDataType({ sidebarShow: false })
    );

    await expect(ManagerData(baseProps)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("does NOT call notFound for a master in editing mode, even when the DataType is not promoted to the sidebar (T-041: unica via di gestione rimasta)", async () => {
    (isUserCampaignMaster as Mock).mockResolvedValue(true);
    (getDataTypeByName as Mock).mockResolvedValue(
      mockDataType({ sidebarShow: false })
    );

    await expect(
      ManagerData({ ...baseProps, editing: true })
    ).resolves.not.toThrow();
    expect(notFound).not.toHaveBeenCalled();
  });

  describe("Documents rendering (T-021)", () => {
    beforeEach(() => {
      (getDataTypeByName as Mock).mockResolvedValue(
        mockDataType({
          sidebarShow: true,
          renderAs: DataTypeRender.files,
        })
      );
    });

    it("does not call notFound for a documents section (unlike the pre-T-021 behaviour)", async () => {
      await expect(ManagerData(baseProps)).resolves.not.toThrow();
      expect(notFound).not.toHaveBeenCalled();
    });

    it("passes visible documents (name + fileUrl) to the DocumentsManager, hiding fileUrl-less/hidden ones from non-staff", async () => {
      (listReferenceDataForDataType as Mock).mockResolvedValue([
        mockReferenceData({
          id: 1,
          name: "Regolamento tecnico",
          visibility: DataVisibility.visible,
          fileUrl: "https://utfs.io/f/abc123_regolamento.pdf",
        }),
        mockReferenceData({
          id: 2,
          name: "Bozza riservata",
          visibility: DataVisibility.hidden,
          fileUrl: "https://utfs.io/f/secret_bozza.pdf",
        }),
      ]);

      const result = await ManagerData(baseProps);
      const html = JSON.stringify(result);

      expect(html).toContain("Regolamento tecnico");
      expect(html).toContain("https://utfs.io/f/abc123_regolamento.pdf");
      expect(html).not.toContain("Bozza riservata");
    });

    it("marks isMaster=true for a campaign master in editing mode, passing it to the DocumentsManager", async () => {
      (isUserCampaignMaster as Mock).mockResolvedValue(true);
      (listReferenceDataForDataType as Mock).mockResolvedValue([
        mockReferenceData({ id: 1, name: "Regolamento" }),
      ]);

      const result = await ManagerData({
        ...baseProps,
        editing: true,
      });

      expect(JSON.stringify(result)).toContain('"isMaster":true');
    });

    it("marks isMaster=false for a supporter (staff but not master)", async () => {
      (isUserCampaignHelper as Mock).mockResolvedValue(true);
      (isUserCampaignMaster as Mock).mockResolvedValue(false);
      (listReferenceDataForDataType as Mock).mockResolvedValue([
        mockReferenceData({ id: 1, name: "Regolamento" }),
      ]);

      const result = await ManagerData({
        ...baseProps,
        editing: true,
      });

      expect(JSON.stringify(result)).toContain('"isMaster":false');
    });

    it("marks isMaster=false in editing mode for a user without a campaign grant, even if they are super-admin (isSuperAdmin bypass rimosso)", async () => {
      (isUserCampaignMaster as Mock).mockResolvedValue(false);
      (listReferenceDataForDataType as Mock).mockResolvedValue([
        mockReferenceData({ id: 1, name: "Regolamento" }),
      ]);

      const result = await ManagerData({
        ...baseProps,
        editing: true,
      });

      expect(JSON.stringify(result)).toContain('"isMaster":false');
    });

    it("marks isMaster=false for a master NOT in editing mode", async () => {
      (isUserCampaignMaster as Mock).mockResolvedValue(true);
      (listReferenceDataForDataType as Mock).mockResolvedValue([
        mockReferenceData({ id: 1, name: "Regolamento" }),
      ]);

      const result = await ManagerData({
        ...baseProps,
        editing: false,
      });

      expect(JSON.stringify(result)).toContain('"isMaster":false');
    });

    it("shows the empty state and still exposes the create-document action in the header for a master with no documents", async () => {
      (isUserCampaignMaster as Mock).mockResolvedValue(true);
      (listReferenceDataForDataType as Mock).mockResolvedValue([]);

      const result = await ManagerData({
        ...baseProps,
        editing: true,
      });

      // Con 0 documenti visibili la pagina mostra l'empty state al posto
      // del `ManagerDataFiles`, ma l'azione di creazione nell'header resta
      // disponibile per un master, indipendente dal conteggio.
      // Il fragment radice ha sempre 3 slot: barra staff, header, corpo.
      const [, header, body] = result.props.children;
      expect(header.type).toBe(HeroPage);
      expect(header.props.action.type).toBe(ButtonCreateDataFile);
      expect(body.type).toBe(EmptyCard);
    });
  });

  describe("Advanced management passthrough (T-041)", () => {
    beforeEach(() => {
      (getDataTypeByName as Mock).mockResolvedValue(
        mockDataType({ sidebarShow: true, renderAs: DataTypeRender.catalog })
      );
    });

    it("passes the advanced config to `ButtonCreateDataCatalog` for a campaign master (T-041, isUserCampaignAdmin/head_master rimosso: nessuna distinzione ulteriore)", async () => {
      (isUserCampaignMaster as Mock).mockResolvedValue(true);

      const result = await ManagerData({
        ...baseProps,
        editing: true,
      });

      const [, header] = result.props.children;
      expect(header.props.action.type).toBe(ButtonCreateDataCatalog);
      expect(header.props.action.props.advanced).toEqual({
        kind: expect.any(String),
        missiveActive: false,
        downtimeActive: false,
      });
    });
  });

  describe("Talenti rendering (T-046)", () => {
    beforeEach(() => {
      // Feature "progress" attiva con talenti abilitati di default
      // (T-0xx, fusione — talenti non ha più una propria Feature): questi
      // test coprono il rendering (kind === talent → sempre
      // ManagerDataTalents), non il gate di accesso per viewer non-staff
      // (coperto in "Access gating").
      (getFeatureByFunctionName as Mock).mockResolvedValue(
        mockFeature({ featureData: { talentsEnabled: true } })
      );
      // `renderAs: catalog` volutamente, per verificare che il branch su
      // `kind === talent` abbia priorità sullo switch su `renderAs` (una
      // categoria talent resta sempre `ManagerDataTalents`, mai
      // `ManagerDataCatalogs`, indipendentemente da `renderAs`).
      (getDataTypeByName as Mock).mockResolvedValue(
        mockDataType({
          kind: DataTypeKind.talent,
          sidebarShow: true,
          renderAs: DataTypeRender.catalog,
        })
      );
    });

    it("renders ManagerDataTalents instead of ManagerDataCatalogs for a talent-kind DataType", async () => {
      (listReferenceDataForDataType as Mock).mockResolvedValue([
        mockReferenceData({ id: 1, name: "Lama del Veterano" }),
      ]);

      const result = await ManagerData(baseProps);

      const [, , body] = result.props.children;
      expect(body.type).toBe(ManagerDataTalents);
    });

    it("passes isMaster to ManagerDataTalents independently from the editing toggle", async () => {
      (isUserCampaignMaster as Mock).mockResolvedValue(true);
      (listReferenceDataForDataType as Mock).mockResolvedValue([
        mockReferenceData({ id: 1, name: "Lama del Veterano" }),
      ]);

      const result = await ManagerData({ ...baseProps, editing: false });

      const [, , body] = result.props.children;
      expect(body.props.isMaster).toBe(false);
    });

    it("includes ButtonCreateDataTalent (form dedicato ai talenti) plus the CSV export/import actions in the header for Talenti", async () => {
      (isUserCampaignMaster as Mock).mockResolvedValue(true);
      (listReferenceDataForDataType as Mock).mockResolvedValue([
        mockReferenceData({ id: 1, name: "Lama del Veterano" }),
      ]);

      const result = await ManagerData({ ...baseProps, editing: true });

      const [, header] = result.props.children;
      const actionTypes = React.Children.toArray(
        header.props.action.props.children
      ).map((child: React.ReactElement) => child.type);
      expect(actionTypes).toEqual([
        ButtonExportTalentsCsv,
        ButtonImportTalentsCsv,
        ButtonCreateDataTalent,
      ]);
    });
  });

  describe("Talenti access gating", () => {
    beforeEach(() => {
      (getDataTypeByName as Mock).mockResolvedValue(
        mockDataType({
          kind: DataTypeKind.talent,
          sidebarShow: true,
          renderAs: DataTypeRender.catalog,
        })
      );
      (listReferenceDataForDataType as Mock).mockResolvedValue([
        mockReferenceData({ id: 1, name: "Lama del Veterano" }),
      ]);
    });

    it("calls notFound for a non-staff viewer when the talents Feature is inactive/never configured", async () => {
      (getFeatureByFunctionName as Mock).mockResolvedValue(null);

      await expect(ManagerData(baseProps)).rejects.toThrow("NEXT_NOT_FOUND");
    });

    it("does NOT call notFound for a non-staff viewer when the talents Feature is active", async () => {
      (getFeatureByFunctionName as Mock).mockResolvedValue(
        mockFeature({ featureData: { talentsEnabled: true } })
      );

      await expect(ManagerData(baseProps)).resolves.toBeDefined();
    });

    it("calls notFound for a staff viewer too when the talents Feature is inactive (only re-activating it from admin/features restores access)", async () => {
      (isUserCampaignMaster as Mock).mockResolvedValue(true);
      (getFeatureByFunctionName as Mock).mockResolvedValue(null);

      await expect(ManagerData(baseProps)).rejects.toThrow("NEXT_NOT_FOUND");
    });

    it("does NOT call notFound for a staff viewer when the talents Feature is active", async () => {
      (isUserCampaignMaster as Mock).mockResolvedValue(true);
      (getFeatureByFunctionName as Mock).mockResolvedValue(
        mockFeature({ featureData: { talentsEnabled: true } })
      );

      await expect(ManagerData(baseProps)).resolves.toBeDefined();
    });
  });

  describe("Visibility enforcement", () => {
    beforeEach(() => {
      (getDataTypeByName as Mock).mockResolvedValue(
        mockDataType({ sidebarShow: true, renderAs: DataTypeRender.catalog })
      );
    });

    it("hides `hidden` ReferenceData from a non-staff viewer", async () => {
      (listReferenceDataForDataType as Mock).mockResolvedValue([
        mockReferenceData({
          id: 1,
          name: "Elfo",
          visibility: DataVisibility.visible,
        }),
        mockReferenceData({
          id: 2,
          name: "Segreto di Master",
          visibility: DataVisibility.hidden,
        }),
      ]);

      const result = await ManagerData(baseProps);

      const html = JSON.stringify(result);
      expect(html).toContain("Elfo");
      expect(html).not.toContain("Segreto di Master");
    });

    it("shows `hidden` ReferenceData to a staff viewer", async () => {
      (isUserCampaignHelper as Mock).mockResolvedValue(true);
      (listReferenceDataForDataType as Mock).mockResolvedValue([
        mockReferenceData({
          id: 2,
          name: "Segreto di Master",
          visibility: DataVisibility.hidden,
        }),
      ]);

      const result = await ManagerData(baseProps);

      expect(JSON.stringify(result)).toContain("Segreto di Master");
    });

    it("hides `hidden` ReferenceData from a user without a campaign grant, even if they are super-admin (isSuperAdmin bypass rimosso)", async () => {
      (listReferenceDataForDataType as Mock).mockResolvedValue([
        mockReferenceData({
          id: 2,
          name: "Segreto di Master",
          visibility: DataVisibility.hidden,
        }),
      ]);

      const result = await ManagerData(baseProps);

      expect(JSON.stringify(result)).not.toContain("Segreto di Master");
    });

    it("hides a `hidden` ReferenceData from the viewer regardless of their ownedData (T-050: no visibleWith wired here, unlike characterTalents.service.ts)", async () => {
      (listReferenceDataForDataType as Mock).mockResolvedValue([
        mockReferenceData({
          id: 3,
          name: "Rituale del Culto",
          visibility: DataVisibility.hidden,
        }),
      ]);
      (getUserCharacterInCampaign as Mock).mockResolvedValue(
        mockCharacter({ id: 42, userId: "user-1" })
      );
      (listOwnedCharacterDataInCampaign as Mock).mockResolvedValue([
        {
          ...mockCharacterData({ dataTypeId: 7 }),
          dataType: mockDataType({
            id: 7,
            kind: DataTypeKind.assignable,
            assignability: DataTypeAssignability.creationOnly,
          }),
        },
      ]);

      const result = await ManagerData(baseProps);
      expect(JSON.stringify(result)).not.toContain("Rituale del Culto");
    });

    it("passes the viewer's character to the visibility context", async () => {
      const character = mockCharacter({ id: 42, userId: "user-1" });
      (getUserCharacterInCampaign as Mock).mockResolvedValue(character);

      await ManagerData(baseProps);

      expect(listOwnedCharacterDataInCampaign).toHaveBeenCalledWith(
        expect.anything(),
        campaign.id,
        { userId: "user-1", characterId: 42 }
      );
    });

    it("shows an empty state when there are no visible entries", async () => {
      (listReferenceDataForDataType as Mock).mockResolvedValue([]);

      const result = await ManagerData(baseProps);

      const [, , body] = result.props.children;
      expect(body.type).toBe(EmptyCard);
    });
  });
});
