import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { notFound } from "next/navigation";
import {
  DataCardinality,
  DataTypeAssignability,
  DataTypeKind,
  DataTypeRender,
  DataVisibility,
  Role,
  XpReason,
} from "@prisma/client";
// vi.mock è hoisted sopra gli import: importare qui i moduli mockati è sicuro
import Page, { generateMetadata } from "../page";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getUserCampaignRole } from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { listCharacterDataForCharacterWithDetails } from "@/lib/repositories/characterData.repository";
import { listFeaturesForCampaign } from "@/lib/repositories/feature.repository";
import { listDataTypes } from "@/lib/repositories/dataType.repository";
import { listReferenceDataForCampaign } from "@/lib/repositories/referenceData.repository";
import { listRequirementsForCampaign } from "@/lib/repositories/dataRequirement.repository";
import { getXpBalance } from "@/lib/services/xp.service";
import { listXpTransactionsForCharacter } from "@/lib/repositories/xpTransaction.repository";
import {
  mockCharacter,
  mockCampaign,
  mockOrganization,
  mockUser,
  mockBooking,
  mockEvent,
  mockDataType,
  mockReferenceData,
  mockCharacterData,
  mockXpTransaction,
  mockFeature,
  mockFeatureType,
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

// Mock prisma
vi.mock("@/lib/db", () => ({
  prisma: {
    character: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock authorization helpers
vi.mock("@/lib/authorization", () => ({
  getUserCampaignRole: vi.fn(),
  isUserCampaignMaster: vi.fn().mockResolvedValue(false),
}));

// Mock repository/servizi usati dalle sezioni "Dati personaggio"/"Esperienza"
// (T-034)
vi.mock("@/lib/repositories/campaign.repository", () => ({
  getCampaignBySlug: vi.fn(),
}));
vi.mock("@/lib/repositories/characterData.repository", () => ({
  listCharacterDataForCharacterWithDetails: vi.fn(),
}));
vi.mock("@/lib/services/xp.service", () => ({
  getXpBalance: vi.fn(),
}));
vi.mock("@/lib/repositories/xpTransaction.repository", () => ({
  listXpTransactionsForCharacter: vi.fn(),
}));
vi.mock("@/lib/repositories/feature.repository", () => ({
  listFeaturesForCampaign: vi.fn(),
}));
vi.mock("@/lib/repositories/dataType.repository", () => ({
  listDataTypes: vi.fn(),
}));
vi.mock("@/lib/repositories/referenceData.repository", () => ({
  listReferenceDataForCampaign: vi.fn(),
}));
vi.mock("@/lib/repositories/dataRequirement.repository", () => ({
  listRequirementsForCampaign: vi.fn(),
}));

// `filterVisible`/il registry non sono mockati: verifica il comportamento
// reale end-to-end (regola CLAUDE.md: visibilità server-side), come già in
// `data/[dataSlug]/__tests__/page.test.tsx`.

// La page delega tutto a `CharacterPage` (server component async condiviso con
// la vista admin): la eseguiamo esplicitamente per testarne la logica.
const CharacterDetailPage = async (props: Parameters<typeof Page>[0]) => {
  const element = (await Page(props)) as unknown as {
    type: (p: unknown) => Promise<unknown>;
    props: unknown;
  };
  return element.type(element.props);
};

describe("Character Detail Page", () => {
  const mockParams = {
    campaignSlug: "test-campaign",
    id: "1",
  };
  const campaign = mockCampaign();

  beforeEach(() => {
    vi.clearAllMocks();
    (getCampaignBySlug as Mock).mockResolvedValue(campaign);
    (listCharacterDataForCharacterWithDetails as Mock).mockResolvedValue([]);
    (getXpBalance as Mock).mockResolvedValue({
      earned: 0,
      available: 0,
    });
    (listXpTransactionsForCharacter as Mock).mockResolvedValue([]);
    (listFeaturesForCampaign as Mock).mockResolvedValue([]);
    (listDataTypes as Mock).mockResolvedValue([]);
    (listReferenceDataForCampaign as Mock).mockResolvedValue([]);
    (listRequirementsForCampaign as Mock).mockResolvedValue([]);
  });

  describe("generateMetadata", () => {
    it("should return character name in metadata when character exists", async () => {
      const mockCharacterData = {
        ...mockCharacter({ name: "Test Hero" }),
      };

      (prisma.character.findUnique as Mock).mockResolvedValue(
        mockCharacterData
      );

      const metadata = await generateMetadata({
        params: Promise.resolve(mockParams),
      });

      expect(metadata.title).toBe("Test Hero | Arcana Domine");
      expect(metadata.description).toBe("Dettagli del personaggio Test Hero");
    });

    it("should return not found metadata when character does not exist", async () => {
      (prisma.character.findUnique as Mock).mockResolvedValue(null);

      const metadata = await generateMetadata({
        params: Promise.resolve(mockParams),
      });

      expect(metadata.title).toBe("Personaggio Non Trovato");
      expect(metadata.description).toBeUndefined();
    });
  });

  describe("Access Control", () => {
    it("should call notFound when user is not authenticated", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

      await expect(
        CharacterDetailPage({ params: Promise.resolve(mockParams) })
      ).rejects.toThrow("NEXT_NOT_FOUND");

      expect(notFound).toHaveBeenCalled();
    });

    it("should call notFound when character does not exist", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(null);

      await expect(
        CharacterDetailPage({ params: Promise.resolve(mockParams) })
      ).rejects.toThrow("NEXT_NOT_FOUND");

      expect(notFound).toHaveBeenCalled();
    });

    it("should allow access when user is the character owner", async () => {
      const mockCharacterData = {
        ...mockCharacter({ userId: "user-1" }),
        campaign: {
          ...mockCampaign(),
          organization: mockOrganization(),
        },
        user: mockUser(),
        bookings: [],
      };

      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(
        mockCharacterData
      );
      (getUserCampaignRole as Mock).mockResolvedValue(null);

      const result = await CharacterDetailPage({
        params: Promise.resolve(mockParams),
      });

      expect(notFound).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it("should allow access when user is campaign admin", async () => {
      const mockCharacterData = {
        ...mockCharacter({ userId: "user-2" }),
        campaign: {
          ...mockCampaign(),
          organization: mockOrganization(),
        },
        user: mockUser({ id: "user-2" }),
        bookings: [],
      };

      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(
        mockCharacterData
      );
      (getUserCampaignRole as Mock).mockResolvedValue(Role.master);

      const result = await CharacterDetailPage({
        params: Promise.resolve(mockParams),
      });

      expect(notFound).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    // Il gate "owner o master, altrimenti 404" per un viewer estraneo vive
    // ora in characters/[id]/layout.tsx (vedi __tests__/layout.test.tsx),
    // non più qui: questa pagina è già presidiata a monte e non ripete più
    // il controllo. Verifichiamo solo che la pagina, se raggiunta, non
    // fallisca e non esponga contenuti riservati a chi non è editable (vedi
    // le sezioni "does not fetch..." più sotto).
    it("does not gate access itself for a non-owner/non-admin viewer (delegated to the parent layout)", async () => {
      const mockCharacterData = {
        ...mockCharacter({ userId: "user-2" }),
        campaign: {
          ...mockCampaign(),
          organization: mockOrganization(),
        },
        user: mockUser({ id: "user-2" }),
        bookings: [],
      };

      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(
        mockCharacterData
      );
      (getUserCampaignRole as Mock).mockResolvedValue(null);

      const result = await CharacterDetailPage({
        params: Promise.resolve(mockParams),
      });

      expect(notFound).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("Data Fetching", () => {
    it("should fetch character with correct query parameters", async () => {
      const mockCharacterData = {
        ...mockCharacter(),
        campaign: {
          ...mockCampaign(),
          organization: mockOrganization(),
        },
        user: mockUser(),
        bookings: [],
      };

      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(
        mockCharacterData
      );
      (getUserCampaignRole as Mock).mockResolvedValue(null);

      await CharacterDetailPage({ params: Promise.resolve(mockParams) });

      expect(prisma.character.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 1,
            campaign: {
              slug: "test-campaign",
              organization: {
                slug: "arcana-domine",
              },
            },
          },
          include: expect.objectContaining({
            campaign: expect.any(Object),
            user: expect.any(Object),
            bookings: expect.any(Object),
          }),
        })
      );
    });

    it("should include bookings with events limited to 20", async () => {
      const mockCharacterData = {
        ...mockCharacter(),
        campaign: {
          ...mockCampaign(),
          organization: mockOrganization(),
        },
        user: mockUser(),
        bookings: [],
      };

      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(
        mockCharacterData
      );
      (getUserCampaignRole as Mock).mockResolvedValue(null);

      await CharacterDetailPage({ params: Promise.resolve(mockParams) });

      expect(prisma.character.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            bookings: expect.objectContaining({
              take: 20,
              orderBy: {
                event: {
                  dateEventStart: "desc",
                },
              },
            }),
          }),
        })
      );
    });
  });

  describe("Character States", () => {
    it("should handle character with all dates populated", async () => {
      const mockCharacterData = {
        ...mockCharacter({
          creationDate: new Date("2024-01-01"),
          approvalDate: new Date("2024-01-02"),
          deathDate: new Date("2024-06-01"),
          parkDate: null,
        }),
        campaign: {
          ...mockCampaign(),
          organization: mockOrganization(),
        },
        user: mockUser(),
        bookings: [],
      };

      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(
        mockCharacterData
      );
      (getUserCampaignRole as Mock).mockResolvedValue(null);

      const result = await CharacterDetailPage({
        params: Promise.resolve(mockParams),
      });

      expect(result).toBeDefined();
    });

    it("should handle character without optional dates", async () => {
      const mockCharacterData = {
        ...mockCharacter({
          approvalDate: null,
          deathDate: null,
          parkDate: null,
        }),
        campaign: {
          ...mockCampaign(),
          organization: mockOrganization(),
        },
        user: mockUser(),
        bookings: [],
      };

      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(
        mockCharacterData
      );
      (getUserCampaignRole as Mock).mockResolvedValue(null);

      const result = await CharacterDetailPage({
        params: Promise.resolve(mockParams),
      });

      expect(result).toBeDefined();
    });

    it("should handle character with bookings", async () => {
      const mockCharacterData = {
        ...mockCharacter(),
        campaign: {
          ...mockCampaign(),
          organization: mockOrganization(),
        },
        user: mockUser(),
        bookings: [
          {
            ...mockBooking(),
            event: mockEvent(),
          },
          {
            ...mockBooking({ id: 2, eventId: 2 }),
            event: mockEvent({ id: 2, name: "Second Event" }),
          },
        ],
      };

      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(
        mockCharacterData
      );
      (getUserCampaignRole as Mock).mockResolvedValue(null);

      const result = await CharacterDetailPage({
        params: Promise.resolve(mockParams),
      });

      expect(result).toBeDefined();
    });

    it("should handle PG character type", async () => {
      const mockCharacterData = {
        ...mockCharacter({ type: "pg" }),
        campaign: {
          ...mockCampaign(),
          organization: mockOrganization(),
        },
        user: mockUser(),
        bookings: [],
      };

      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(
        mockCharacterData
      );
      (getUserCampaignRole as Mock).mockResolvedValue(null);

      const result = await CharacterDetailPage({
        params: Promise.resolve(mockParams),
      });

      expect(result).toBeDefined();
    });

    it("should handle PNG character type", async () => {
      const mockCharacterData = {
        ...mockCharacter({ type: "png" }),
        campaign: {
          ...mockCampaign(),
          organization: mockOrganization(),
        },
        user: mockUser(),
        bookings: [],
      };

      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(
        mockCharacterData
      );
      (getUserCampaignRole as Mock).mockResolvedValue(null);

      const result = await CharacterDetailPage({
        params: Promise.resolve(mockParams),
      });

      expect(result).toBeDefined();
    });
  });

  describe("Admin Permissions", () => {
    it("should check admin status for the correct campaign", async () => {
      const mockCharacterData = {
        ...mockCharacter({ campaignId: 5 }),
        campaign: {
          ...mockCampaign({ id: 5 }),
          organization: mockOrganization(),
        },
        user: mockUser({ id: "user-2" }),
        bookings: [],
      };

      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(
        mockCharacterData
      );
      (getUserCampaignRole as Mock).mockResolvedValue(Role.master);

      await CharacterDetailPage({ params: Promise.resolve(mockParams) });

      expect(getUserCampaignRole).toHaveBeenCalledWith(
        expect.anything(),
        "user-1",
        5
      );
    });
  });

  describe("Edge Cases", () => {
    it("should handle null lastUpdateDate", async () => {
      const mockCharacterData = {
        ...mockCharacter({ lastUpdateDate: null }),
        campaign: {
          ...mockCampaign(),
          organization: mockOrganization(),
        },
        user: mockUser(),
        bookings: [],
      };

      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(
        mockCharacterData
      );
      (getUserCampaignRole as Mock).mockResolvedValue(null);

      const result = await CharacterDetailPage({
        params: Promise.resolve(mockParams),
      });

      expect(result).toBeDefined();
    });

    it("should handle empty background and notes", async () => {
      const mockCharacterData = {
        ...mockCharacter({
          background: null,
          playerNotes: null,
          masterNotes: null,
        }),
        campaign: {
          ...mockCampaign(),
          organization: mockOrganization(),
        },
        user: mockUser(),
        bookings: [],
      };

      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(
        mockCharacterData
      );
      (getUserCampaignRole as Mock).mockResolvedValue(null);

      const result = await CharacterDetailPage({
        params: Promise.resolve(mockParams),
      });

      expect(result).toBeDefined();
    });

    it("should handle booking with null payment date", async () => {
      const mockCharacterData = {
        ...mockCharacter(),
        campaign: {
          ...mockCampaign(),
          organization: mockOrganization(),
        },
        user: mockUser(),
        bookings: [
          {
            ...mockBooking({ paymentDate: null }),
            event: mockEvent(),
          },
        ],
      };

      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(
        mockCharacterData
      );
      (getUserCampaignRole as Mock).mockResolvedValue(null);

      const result = await CharacterDetailPage({
        params: Promise.resolve(mockParams),
      });

      expect(result).toBeDefined();
    });
  });

  // T-034: sezioni "Dati personaggio" (CharacterData raggruppate per
  // DataType, filtrate per visibilità) e "Esperienza" (saldo XP).
  describe("CharacterData section (T-034)", () => {
    const ownerCharacter = {
      ...mockCharacter({ userId: "user-1", campaignId: campaign.id }),
      campaign: { ...campaign, organization: mockOrganization() },
      user: mockUser(),
      bookings: [],
    };

    beforeEach(() => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1", email: "owner@example.com" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(ownerCharacter);
      (getUserCampaignRole as Mock).mockResolvedValue(null);
    });

    it("groups visible CharacterData by DataType and shows the definition name", async () => {
      (listCharacterDataForCharacterWithDetails as Mock).mockResolvedValue([
        {
          ...mockCharacterData({
            id: 1,
            characterId: 1,
            dataTypeId: 10,
            visibility: DataVisibility.visible,
          }),
          dataType: mockDataType({ id: 10, name: "Razze" }),
          referenceData: mockReferenceData({ id: 1, name: "Elfo" }),
        },
      ]);

      const result = await CharacterDetailPage({
        params: Promise.resolve(mockParams),
      });
      const html = JSON.stringify(result);

      expect(html).toContain("Razze");
      expect(html).toContain("Elfo");
      // T-038: il toggle di reveal è montato SOLO per lo staff — il
      // proprietario (non-staff) di questo test non deve vederlo, nemmeno su
      // una voce visibile.
      expect(html).not.toContain("characterDataId");
    });

    it("hides `hidden` CharacterData without a satisfied condition from the owner (non-staff)", async () => {
      (listCharacterDataForCharacterWithDetails as Mock).mockResolvedValue([
        {
          ...mockCharacterData({
            id: 2,
            characterId: 1,
            dataTypeId: 10,
            visibility: DataVisibility.hidden,
          }),
          dataType: mockDataType({ id: 10, name: "Segreti" }),
          referenceData: mockReferenceData({ id: 2, name: "Nota riservata" }),
        },
      ]);

      const result = await CharacterDetailPage({
        params: Promise.resolve(mockParams),
      });
      const html = JSON.stringify(result);

      expect(html).not.toContain("Nota riservata");
      // Nessuna voce visibile: il gruppo passato a `CharacterEditor` (che
      // mostra "Nessun dato assegnato" quando è vuoto) è un array vuoto.
      expect(html).toContain('"characterDataGroups":[]');
    });

    it("shows `hidden` CharacterData to campaign staff viewing another player's character", async () => {
      const otherPlayerCharacter = {
        ...mockCharacter({ userId: "user-2", campaignId: campaign.id }),
        campaign: { ...campaign, organization: mockOrganization() },
        user: mockUser({ id: "user-2" }),
        bookings: [],
      };
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "staff-1", email: "staff@example.com" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(
        otherPlayerCharacter
      );
      (getUserCampaignRole as Mock).mockResolvedValue(Role.master);
      (listCharacterDataForCharacterWithDetails as Mock).mockResolvedValue([
        {
          ...mockCharacterData({
            id: 3,
            characterId: 1,
            dataTypeId: 10,
            visibility: DataVisibility.hidden,
          }),
          dataType: mockDataType({ id: 10, name: "Segreti" }),
          referenceData: mockReferenceData({ id: 3, name: "Nota riservata" }),
        },
      ]);

      const result = await CharacterDetailPage({
        params: Promise.resolve(mockParams),
      });

      const html = JSON.stringify(result);
      expect(html).toContain("Nota riservata");
      // T-038: la `CharacterData` mostrata (id 3) raggiunge `CharacterEditor`,
      // che monta il toggle di reveal per lo staff con quell'id.
      expect(html).toContain('"entries":[{"id":3');
    });

    it("fetches CharacterData scoped to the character being viewed (owner path)", async () => {
      await CharacterDetailPage({ params: Promise.resolve(mockParams) });

      expect(listCharacterDataForCharacterWithDetails).toHaveBeenCalledWith(
        expect.anything(),
        ownerCharacter.id
      );
    });
  });

  describe("XP section (T-034)", () => {
    const ownerCharacter = {
      ...mockCharacter({ userId: "user-1", campaignId: campaign.id }),
      campaign: { ...campaign, organization: mockOrganization() },
      user: mockUser(),
      bookings: [],
    };

    it("shows the XP balance to the character's owner", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1", email: "owner@example.com" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(ownerCharacter);
      (getUserCampaignRole as Mock).mockResolvedValue(null);
      (getXpBalance as Mock).mockResolvedValue({
        earned: 40,
        available: 40,
      });

      const result = await CharacterDetailPage({
        params: Promise.resolve(mockParams),
      });
      const html = JSON.stringify(result);

      // Il saldo XP raggiunge `CharacterEditor` (che mostra la sezione
      // "Esperienza") tramite la prop `xpBalance`.
      expect(html).toContain('"xpBalance":{"earned":40,"available":40}');
      expect(getXpBalance).toHaveBeenCalledWith(
        expect.anything(),
        ownerCharacter.id
      );
    });

    it("shows the XP balance and recent transactions to campaign staff", async () => {
      const otherPlayerCharacter = {
        ...mockCharacter({ id: 7, userId: "user-2", campaignId: campaign.id }),
        campaign: { ...campaign, organization: mockOrganization() },
        user: mockUser({ id: "user-2" }),
        bookings: [],
      };
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "staff-1", email: "staff@example.com" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(
        otherPlayerCharacter
      );
      (getUserCampaignRole as Mock).mockResolvedValue(Role.master);
      (getXpBalance as Mock).mockResolvedValue({
        earned: 10,
        available: 10,
      });
      (listXpTransactionsForCharacter as Mock).mockResolvedValue([
        mockXpTransaction({
          id: 1,
          characterId: 7,
          amount: 10,
          reason: XpReason.initialGrant,
        }),
      ]);

      const result = await CharacterDetailPage({
        params: Promise.resolve(mockParams),
      });
      const html = JSON.stringify(result);

      // Saldo e transazioni raggiungono `CharacterEditor` (che mostra
      // "Esperienza"/"Movimenti recenti") tramite le prop `xpBalance`/
      // `xpTransactions`.
      expect(html).toContain('"xpBalance":{"earned":10,"available":10}');
      expect(html).toContain('"reason":"initialGrant"');
    });

    it("fetches the XP balance unconditionally, relying on the owner-or-master gate in characters/[id]/layout.tsx", async () => {
      // Il gate "owner o master" è applicato una sola volta a monte, in
      // characters/[id]/layout.tsx (vedi layout.test.tsx): questa pagina non
      // lo duplica, e interroga saldo/CharacterData non appena viene
      // raggiunta.
      const otherPlayerCharacter = {
        ...mockCharacter({ id: 8, userId: "user-2", campaignId: campaign.id }),
        campaign: { ...campaign, organization: mockOrganization() },
        user: mockUser({ id: "user-2" }),
        bookings: [],
      };
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-3", email: "another-player@example.com" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(
        otherPlayerCharacter
      );
      (getUserCampaignRole as Mock).mockResolvedValue(null);

      await CharacterDetailPage({ params: Promise.resolve(mockParams) });

      expect(notFound).not.toHaveBeenCalled();
      expect(getXpBalance).toHaveBeenCalled();
      expect(listCharacterDataForCharacterWithDetails).toHaveBeenCalled();
    });
  });

  describe("Azioni disponibili (T-035)", () => {
    const ownerCharacter = {
      ...mockCharacter({ userId: "user-1", campaignId: campaign.id }),
      campaign: { ...campaign, organization: mockOrganization() },
      user: mockUser(),
      bookings: [],
    };

    beforeEach(() => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1", email: "owner@example.com" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(ownerCharacter);
      (getUserCampaignRole as Mock).mockResolvedValue(null);
    });

    it("links to a Feature whose functionName has a registered handler", async () => {
      (listFeaturesForCampaign as Mock).mockResolvedValue([
        {
          ...mockFeature({ id: 1, featureTypeId: 1 }),
          featureType: mockFeatureType({
            id: 1,
            featureName: "Progressi",
            functionName: "progress",
          }),
        },
      ]);

      const result = await CharacterDetailPage({
        params: Promise.resolve(mockParams),
      });
      const html = JSON.stringify(result);

      // `progress` ha un handler registrato (T-0xx, fusione talenti +
      // recupero XP alla morte) ed è quindi passato a `CharacterEditor`
      // tramite la prop dedicata `progressFeature` (la card "Talenti" e
      // il relativo link sono costruiti lì, non in questa pagina — vedi il
      // commento su MISSIVE/talento in `page.tsx`).
      expect(html).toContain('"progressFeature"');
      expect(html).toContain('"featureName":"Progressi"');
      expect(html).toContain('"functionName":"progress"');
    });

    it("hides a Feature whose functionName has no registered handler", async () => {
      (listFeaturesForCampaign as Mock).mockResolvedValue([
        {
          ...mockFeature({ id: 2, featureTypeId: 2 }),
          featureType: mockFeatureType({
            id: 2,
            featureName: "Funzione non implementata",
            functionName: "someUnimplementedFunction",
          }),
        },
      ]);

      const result = await CharacterDetailPage({
        params: Promise.resolve(mockParams),
      });
      const html = JSON.stringify(result);

      expect(html).not.toContain("Funzione non implementata");
      // Nessuna Feature registrata sopravvive al filtro: nessun prop
      // `availableActions` (T-0xx, rimosso — le categorie downtime non sono
      // più Feature separate, `CharacterEditor` non ne ha più bisogno).
      expect(html).not.toContain('"availableActions"');
    });

    it("shows the empty state when the campaign has no Feature configured", async () => {
      (listFeaturesForCampaign as Mock).mockResolvedValue([]);

      const result = await CharacterDetailPage({
        params: Promise.resolve(mockParams),
      });
      const html = JSON.stringify(result);

      expect(html).not.toContain('"availableActions"');
    });

    it("fetches Features unconditionally, relying on the owner-or-master gate in characters/[id]/layout.tsx", async () => {
      const otherPlayerCharacter = {
        ...mockCharacter({ id: 9, userId: "user-2", campaignId: campaign.id }),
        campaign: { ...campaign, organization: mockOrganization() },
        user: mockUser({ id: "user-2" }),
        bookings: [],
      };
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-3", email: "another-player@example.com" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(
        otherPlayerCharacter
      );
      (getUserCampaignRole as Mock).mockResolvedValue(null);

      await CharacterDetailPage({ params: Promise.resolve(mockParams) });

      expect(notFound).not.toHaveBeenCalled();
      expect(listFeaturesForCampaign).toHaveBeenCalled();
    });
  });

  // T-034: le sezioni CharacterData/XP devono restare scopate alla stessa
  // campagna del personaggio risolto tramite `campaignSlug`/`orgSlug`
  // (`getCharacterByIdScoped`), non ad altre campagne dell'utente/dello staff.
  describe("Multi-tenant isolation (T-034)", () => {
    it("scopes CharacterData/XP/campaign lookups to the character's own campaign", async () => {
      const scopedCharacter = {
        ...mockCharacter({ id: 99, userId: "user-1", campaignId: 5 }),
        campaign: {
          ...mockCampaign({ id: 5, slug: "test-campaign" }),
          organization: mockOrganization(),
        },
        user: mockUser(),
        bookings: [],
      };
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1", email: "owner@example.com" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(scopedCharacter);
      (getUserCampaignRole as Mock).mockResolvedValue(null);

      await CharacterDetailPage({ params: Promise.resolve(mockParams) });

      // Il personaggio è già stato risolto scoping su campaignSlug/orgSlug
      // (`prisma.character.findUnique` con `where.campaign`), quindi ogni
      // query successiva deve usare l'id/campaignId di QUEL personaggio.
      expect(getCampaignBySlug).toHaveBeenCalledWith(
        expect.anything(),
        "test-campaign",
        "arcana-domine"
      );
      expect(listCharacterDataForCharacterWithDetails).toHaveBeenCalledWith(
        expect.anything(),
        99
      );
      expect(getXpBalance).toHaveBeenCalledWith(expect.anything(), 99);
      expect(listXpTransactionsForCharacter).toHaveBeenCalledWith(
        expect.anything(),
        99,
        expect.any(Number)
      );
    });
  });

  // T-0xx: l'Anagrafica mostra anche i `DataType` `origins`/`assignable` mai
  // valorizzati sul personaggio (`characterEditor.service.ts`,
  // `groupCharacterDataByDataType` produce un gruppo solo per chi ha già una
  // `CharacterData` — qui si verifica l'aggiunta dei gruppi vuoti e il suo
  // gating per ruolo/visibilità/assegnabilità).
  describe("Anagrafica: campi origins/assignable mai valorizzati (T-0xx)", () => {
    const ownerCharacter = {
      ...mockCharacter({ userId: "user-1", campaignId: campaign.id }),
      campaign: { ...campaign, organization: mockOrganization() },
      user: mockUser(),
      bookings: [],
    };

    beforeEach(() => {
      // Nessuna `CharacterData` esistente in questo describe: ogni test
      // verifica solo il comportamento del gruppo "vuoto" aggiunto in coda.
      (listCharacterDataForCharacterWithDetails as Mock).mockResolvedValue([]);
    });

    it("shows an empty masterOnly group to the master, so it can be filled in", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "staff-1", email: "staff@example.com" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(ownerCharacter);
      (getUserCampaignRole as Mock).mockResolvedValue(Role.master);
      (listDataTypes as Mock).mockResolvedValue([
        mockDataType({
          id: 30,
          campaignId: campaign.id,
          name: "Malattie strane",
          kind: DataTypeKind.assignable,
          cardinality: DataCardinality.single,
          assignability: DataTypeAssignability.masterOnly,
          visibility: DataVisibility.hidden,
          renderAs: DataTypeRender.catalog,
        }),
      ]);

      const result = await CharacterDetailPage({
        params: Promise.resolve(mockParams),
      });
      const html = JSON.stringify(result);

      expect(html).toContain("Malattie strane");
      expect(html).toContain('"entries":[]');
    });

    it("hides an empty masterOnly/creationOnly-assignability group from a non-master owner, even when DataType.visibility is visible", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1", email: "owner@example.com" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(ownerCharacter);
      (getUserCampaignRole as Mock).mockResolvedValue(null);
      (listDataTypes as Mock).mockResolvedValue([
        mockDataType({
          id: 31,
          campaignId: campaign.id,
          name: "Fazione",
          kind: DataTypeKind.assignable,
          cardinality: DataCardinality.single,
          assignability: DataTypeAssignability.creationOnly,
          visibility: DataVisibility.visible,
          renderAs: DataTypeRender.catalog,
        }),
      ]);

      const result = await CharacterDetailPage({
        params: Promise.resolve(mockParams),
      });

      // Non è più azionabile dal giocatore (poteva scegliere solo in
      // creazione): un placeholder vuoto sarebbe solo rumore.
      expect(JSON.stringify(result)).not.toContain("Fazione");
    });

    it("shows an empty always-assignable single-cardinality visible group to a non-master owner (self-assign placeholder)", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1", email: "owner@example.com" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(ownerCharacter);
      (getUserCampaignRole as Mock).mockResolvedValue(null);
      (listDataTypes as Mock).mockResolvedValue([
        mockDataType({
          id: 32,
          campaignId: campaign.id,
          name: "Costellazione",
          kind: DataTypeKind.assignable,
          cardinality: DataCardinality.single,
          assignability: DataTypeAssignability.always,
          visibility: DataVisibility.visible,
          renderAs: DataTypeRender.catalog,
        }),
      ]);

      const result = await CharacterDetailPage({
        params: Promise.resolve(mockParams),
      });
      const html = JSON.stringify(result);

      expect(html).toContain("Costellazione");
      expect(html).toContain('"entries":[]');
      expect(html).toContain('"visibility":"visible"');
    });

    it("hides an empty always-assignable single-cardinality group from a non-master owner when DataType.visibility is hidden", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1", email: "owner@example.com" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(ownerCharacter);
      (getUserCampaignRole as Mock).mockResolvedValue(null);
      (listDataTypes as Mock).mockResolvedValue([
        mockDataType({
          id: 33,
          campaignId: campaign.id,
          name: "Morte segreta",
          kind: DataTypeKind.assignable,
          cardinality: DataCardinality.single,
          assignability: DataTypeAssignability.always,
          visibility: DataVisibility.hidden,
          renderAs: DataTypeRender.catalog,
        }),
      ]);

      const result = await CharacterDetailPage({
        params: Promise.resolve(mockParams),
      });

      expect(JSON.stringify(result)).not.toContain("Morte segreta");
    });

    it("excludes a generic-kind DataType from the empty-group listing even for the master (campaign catalogs like Oggetti/Ingredienti are not per-character fields)", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "staff-1", email: "staff@example.com" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(ownerCharacter);
      (getUserCampaignRole as Mock).mockResolvedValue(Role.master);
      (listDataTypes as Mock).mockResolvedValue([
        mockDataType({
          id: 34,
          campaignId: campaign.id,
          name: "Oggetti",
          kind: DataTypeKind.generic,
          cardinality: null,
          assignability: DataTypeAssignability.none,
          visibility: DataVisibility.visible,
          renderAs: DataTypeRender.catalog,
        }),
      ]);

      const result = await CharacterDetailPage({
        params: Promise.resolve(mockParams),
      });

      expect(JSON.stringify(result)).not.toContain("Oggetti");
    });

    it("excludes a non-catalog DataType (renderAs files/pages) from the empty-group listing even for the master", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "staff-1", email: "staff@example.com" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(ownerCharacter);
      (getUserCampaignRole as Mock).mockResolvedValue(Role.master);
      (listDataTypes as Mock).mockResolvedValue([
        mockDataType({
          id: 35,
          campaignId: campaign.id,
          name: "My Pages",
          kind: DataTypeKind.assignable,
          cardinality: DataCardinality.single,
          assignability: DataTypeAssignability.always,
          visibility: DataVisibility.visible,
          renderAs: DataTypeRender.pages,
        }),
      ]);

      const result = await CharacterDetailPage({
        params: Promise.resolve(mockParams),
      });

      expect(JSON.stringify(result)).not.toContain("My Pages");
    });

    it("fetches the reference-data catalog for a non-master owner's self-assignable (always/visible/single) DataType, even with zero owned entries", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1", email: "owner@example.com" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(ownerCharacter);
      (getUserCampaignRole as Mock).mockResolvedValue(null);
      (listDataTypes as Mock).mockResolvedValue([
        mockDataType({
          id: 36,
          campaignId: campaign.id,
          name: "Costellazione",
          kind: DataTypeKind.assignable,
          cardinality: DataCardinality.single,
          assignability: DataTypeAssignability.always,
          visibility: DataVisibility.visible,
          renderAs: DataTypeRender.catalog,
        }),
      ]);

      await CharacterDetailPage({ params: Promise.resolve(mockParams) });

      expect(listReferenceDataForCampaign).toHaveBeenCalledWith(
        expect.anything(),
        campaign.id,
        expect.arrayContaining([36])
      );
    });

    it("does not fetch the reference-data catalog for a non-master owner's non-self-assignable empty DataType", async () => {
      (auth.api.getSession as unknown as Mock).mockResolvedValue({
        user: { id: "user-1", email: "owner@example.com" },
      });
      (prisma.character.findUnique as Mock).mockResolvedValue(ownerCharacter);
      (getUserCampaignRole as Mock).mockResolvedValue(null);
      (listDataTypes as Mock).mockResolvedValue([
        mockDataType({
          id: 37,
          campaignId: campaign.id,
          name: "Fazione",
          kind: DataTypeKind.assignable,
          cardinality: DataCardinality.single,
          assignability: DataTypeAssignability.creationOnly,
          visibility: DataVisibility.visible,
          renderAs: DataTypeRender.catalog,
        }),
      ]);

      await CharacterDetailPage({ params: Promise.resolve(mockParams) });

      // Nessun `DataType` posseduto né self-assignable resta in
      // `originsDataTypeIds`: la fetch del catalogo è del tutto saltata
      // (array vuoto), non solo priva dell'id 37.
      expect(listReferenceDataForCampaign).not.toHaveBeenCalled();
    });
  });
});
