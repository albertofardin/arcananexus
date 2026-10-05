import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { notFound } from "next/navigation";
// vi.mock è hoisted sopra gli import: importare qui i moduli mockati è sicuro
import CampaignLayout from "../layout";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { mockCampaign, mockOrganization } from "@/test/helpers/prisma-fixtures";

// Mock next/navigation - notFound should throw to stop execution
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

// Mock prisma (non usato direttamente: passato ai moduli mockati)
vi.mock("@/lib/db", () => ({
  prisma: {},
}));

// Mock repository campagna
vi.mock("@/lib/repositories/campaign.repository", () => ({
  getCampaignBySlug: vi.fn(),
}));

describe("Campaign Layout (home + sottorotte)", () => {
  const mockParams = { campaignSlug: "test-campaign" };

  // Marker che simula il contenuto di una qualunque sottorotta (es.
  // events/page.tsx, characters/page.tsx, ecc.): la guardia vive nel layout,
  // quindi qualunque children passato da App Router è protetto allo stesso
  // modo, a prescindere da quale sottorotta lo produca.
  const eventsSubrouteMarker = "EVENTS_SUBROUTE_CONTENT_MARKER";
  const eventsChildren = <div>{eventsSubrouteMarker}</div>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call notFound when the campaign does not exist", async () => {
    (getCampaignBySlug as Mock).mockResolvedValue(null);

    await expect(
      CampaignLayout({
        params: Promise.resolve(mockParams),
        children: eventsChildren,
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
  });

  it("should render the subroute's children (e.g. events) when the campaign exists", async () => {
    (getCampaignBySlug as Mock).mockResolvedValue({
      ...mockCampaign(),
      organization: mockOrganization(),
    });

    const result = await CampaignLayout({
      params: Promise.resolve(mockParams),
      children: eventsChildren,
    });

    expect(notFound).not.toHaveBeenCalled();
    const serialized = JSON.stringify(result);
    expect(serialized).toContain(eventsSubrouteMarker);
  });
});
