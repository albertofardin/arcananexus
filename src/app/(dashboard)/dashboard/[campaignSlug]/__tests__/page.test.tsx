import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { notFound } from "next/navigation";
// vi.mock è hoisted sopra gli import: importare qui i moduli mockati è sicuro
import CampaignHomePage from "../page";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { listUserCharacters } from "@/lib/repositories/character.repository";
import { listPublishedEvents } from "@/lib/repositories/event.repository";
import { listFeaturesForCampaign } from "@/lib/repositories/feature.repository";
import { getXpBalance } from "@/lib/services/xp.service";
import { getEffectiveUserId } from "@/lib/authorization";
import {
  mockCampaign,
  mockOrganization,
  mockCharacter,
  mockEvent,
} from "@/test/helpers/prisma-fixtures";

// La guardia di sessione è applicata a monte (dashboard/layout.tsx): qui si
// testa solo il contenuto della bacheca, dato per già autorizzato.

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

// Mock prisma (non usato direttamente: passato ai moduli mockati)
vi.mock("@/lib/db", () => ({
  prisma: {},
}));

vi.mock("@/lib/authorization", () => ({
  getEffectiveUserId: vi.fn(),
}));

vi.mock("@/lib/repositories/campaign.repository", () => ({
  getCampaignBySlug: vi.fn(),
}));

vi.mock("@/lib/repositories/character.repository", () => ({
  listUserCharacters: vi.fn(),
}));

vi.mock("@/lib/repositories/event.repository", () => ({
  listPublishedEvents: vi.fn(),
}));

vi.mock("@/lib/repositories/feature.repository", () => ({
  listFeaturesForCampaign: vi.fn(),
}));

vi.mock("@/lib/services/xp.service", () => ({
  getXpBalance: vi.fn(),
}));

describe("Campaign Home Page (bacheca)", () => {
  const mockParams = { campaignSlug: "test-campaign" };

  beforeEach(() => {
    vi.clearAllMocks();
    (getEffectiveUserId as Mock).mockResolvedValue("user-1");
    (listUserCharacters as Mock).mockResolvedValue([]);
    (listPublishedEvents as Mock).mockResolvedValue({
      events: [],
      totalCount: 0,
    });
    (listFeaturesForCampaign as Mock).mockResolvedValue([]);
    (getXpBalance as Mock).mockResolvedValue({
      earned: 0,
      available: 0,
    });
  });

  it("should call notFound when the campaign does not exist", async () => {
    (getCampaignBySlug as Mock).mockResolvedValue(null);

    await expect(
      CampaignHomePage({ params: Promise.resolve(mockParams) })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
  });

  it("should render the campaign name in the hero banner", async () => {
    (getCampaignBySlug as Mock).mockResolvedValue({
      ...mockCampaign({ name: "Le Cronache di Eldoria" }),
      organization: mockOrganization(),
    });

    const result = await CampaignHomePage({
      params: Promise.resolve(mockParams),
    });

    expect(notFound).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).toContain("Le Cronache di Eldoria");
  });

  it("should look up the campaign scoped to the platform organization", async () => {
    (getCampaignBySlug as Mock).mockResolvedValue({
      ...mockCampaign(),
      organization: mockOrganization(),
    });

    await CampaignHomePage({ params: Promise.resolve(mockParams) });

    expect(getCampaignBySlug).toHaveBeenCalledWith(
      expect.anything(),
      "test-campaign",
      "arcana-domine"
    );
  });

  it("should show an empty state when the user has no characters", async () => {
    (getCampaignBySlug as Mock).mockResolvedValue({
      ...mockCampaign(),
      organization: mockOrganization(),
    });
    (listUserCharacters as Mock).mockResolvedValue([]);

    const result = await CampaignHomePage({
      params: Promise.resolve(mockParams),
    });

    expect(JSON.stringify(result)).toContain(
      "Nessun personaggio ancora creato"
    );
  });

  it("should render every approved character with its XP balance", async () => {
    // Due PG approvati (oltre a uno in revisione): con più di un PG attivo
    // resta la card riassuntiva `CardCharacterSummary`, non la scheda
    // completa (quella scatta solo con esattamente un PG attivo, vedi
    // sotto "Con un solo PG attivo").
    (getCampaignBySlug as Mock).mockResolvedValue({
      ...mockCampaign(),
      organization: mockOrganization(),
    });
    (listUserCharacters as Mock).mockResolvedValue([
      mockCharacter({
        id: 1,
        name: "Aldric il Vendicatore",
        approvalDate: new Date("2024-01-02"),
      }),
      mockCharacter({
        id: 2,
        name: "Personaggio in revisione",
        approvalDate: null,
      }),
      mockCharacter({
        id: 3,
        name: "Brenna la Guaritrice",
        approvalDate: new Date("2024-02-01"),
      }),
    ]);
    (getXpBalance as Mock).mockResolvedValue({
      earned: 12,
      available: 10,
    });

    const result = await CampaignHomePage({
      params: Promise.resolve(mockParams),
    });
    const serialized = JSON.stringify(result);

    // `ActiveCharacterCard` è un componente separato: la sua JSX non viene
    // eseguita da questa chiamata diretta a `CampaignHomePage` (nessun
    // render reale), quindi verifichiamo i dati passati come prop invece
    // del testo formattato che il componente costruirebbe al render.
    expect(serialized).toContain("Aldric il Vendicatore");
    expect(serialized).toContain('"xpAvailable":10');
    expect(serialized).not.toContain("Personaggio in revisione");
  });

  describe("Con un solo PG attivo", () => {
    it("renders the character via the summary card, same as with multiple characters", async () => {
      (getCampaignBySlug as Mock).mockResolvedValue({
        ...mockCampaign(),
        organization: mockOrganization(),
      });
      (listUserCharacters as Mock).mockResolvedValue([
        mockCharacter({
          id: 1,
          name: "Aldric il Vendicatore",
          approvalDate: new Date("2024-01-02"),
        }),
      ]);
      (getXpBalance as Mock).mockResolvedValue({
        earned: 10,
        available: 10,
      });

      const result = await CampaignHomePage({
        params: Promise.resolve(mockParams),
      });
      const serialized = JSON.stringify(result);

      expect(serialized).toContain('"characters":[{"id":1');
      expect(serialized).toContain("Aldric il Vendicatore");
    });
  });

  it("should show an empty state when no event is scheduled", async () => {
    (getCampaignBySlug as Mock).mockResolvedValue({
      ...mockCampaign(),
      organization: mockOrganization(),
    });
    (listPublishedEvents as Mock).mockResolvedValue({
      events: [],
      totalCount: 0,
    });

    const result = await CampaignHomePage({
      params: Promise.resolve(mockParams),
    });

    expect(JSON.stringify(result)).toContain("Nessun evento in programma");
  });

  it("should render the event returned by listPublishedEvents", async () => {
    (getCampaignBySlug as Mock).mockResolvedValue({
      ...mockCampaign(),
      organization: mockOrganization(),
    });
    (listPublishedEvents as Mock).mockResolvedValue({
      events: [
        {
          ...mockEvent({ id: 1, name: "Evento più vicino" }),
          dateEventStart: new Date("2030-01-01"),
          _count: { bookings: 0 },
        },
      ],
      totalCount: 1,
    });

    const result = await CampaignHomePage({
      params: Promise.resolve(mockParams),
    });
    const serialized = JSON.stringify(result);

    expect(serialized).toContain("Evento più vicino");
  });
});
