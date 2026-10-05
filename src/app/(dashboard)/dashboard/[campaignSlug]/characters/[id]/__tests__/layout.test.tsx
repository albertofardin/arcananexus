import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { notFound } from "next/navigation";
// vi.mock è hoisted sopra gli import: importare qui i moduli mockati è sicuro
import CharacterLayout from "../layout";
import { auth } from "@/lib/auth";
import {
  isUserCampaignMaster,
  isUserCampaignHelper,
} from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { getCharacterByIdScoped } from "@/lib/repositories/character.repository";
import { mockCampaign, mockOrganization } from "@/test/helpers/prisma-fixtures";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}));

vi.mock("@/lib/db", () => ({
  prisma: {},
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock("@/lib/authorization", () => ({
  isUserCampaignMaster: vi.fn(),
  isUserCampaignHelper: vi.fn(),
}));

vi.mock("@/lib/repositories/campaign.repository", () => ({
  getCampaignBySlug: vi.fn(),
}));

vi.mock("@/lib/repositories/character.repository", () => ({
  getCharacterByIdScoped: vi.fn(),
}));

// Guardia "owner o master" (T-3 follow-up) per l'intera rotta
// characters/[id]/ (scheda + [actionType]/, entrambe figlie di questo
// layout), estratta dal controllo duplicato che prima viveva in ciascuna
// pagina figlia.
describe("CharacterLayout — guardia owner-o-master (scheda + [actionType])", () => {
  const campaignSlug = "test-campaign";
  const id = "1";
  const subrouteMarker = "PROTECTED_SUBROUTE_CONTENT_MARKER";
  const children = <div>{subrouteMarker}</div>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call notFound when there is no session", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue(null);

    await expect(
      CharacterLayout({
        params: Promise.resolve({ campaignSlug, id }),
        children,
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
    expect(getCampaignBySlug).not.toHaveBeenCalled();
  });

  it("should call notFound when the campaign does not exist", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1" },
    });
    (getCampaignBySlug as Mock).mockResolvedValue(null);

    await expect(
      CharacterLayout({
        params: Promise.resolve({ campaignSlug, id }),
        children,
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
  });

  it("should call notFound when the character does not exist in the resolved campaign", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1" },
    });
    (getCampaignBySlug as Mock).mockResolvedValue({
      ...mockCampaign(),
      organization: mockOrganization(),
    });
    (getCharacterByIdScoped as Mock).mockResolvedValue(null);

    await expect(
      CharacterLayout({
        params: Promise.resolve({ campaignSlug, id }),
        children,
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
  });

  it("should call notFound with a malformed (non-numeric) id, without querying the character", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1" },
    });
    (getCampaignBySlug as Mock).mockResolvedValue({
      ...mockCampaign(),
      organization: mockOrganization(),
    });

    await expect(
      CharacterLayout({
        params: Promise.resolve({ campaignSlug, id: "not-a-number" }),
        children,
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(getCharacterByIdScoped).not.toHaveBeenCalled();
  });

  it("should allow access when the user is the character owner (even if not master)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-1" },
    });
    (getCampaignBySlug as Mock).mockResolvedValue({
      ...mockCampaign({ id: 7 }),
      organization: mockOrganization(),
    });
    (getCharacterByIdScoped as Mock).mockResolvedValue({
      id: 1,
      campaignId: 7,
      userId: "user-1",
    });
    (isUserCampaignMaster as Mock).mockResolvedValue(false);
    (isUserCampaignHelper as Mock).mockResolvedValue(false);

    const result = await CharacterLayout({
      params: Promise.resolve({ campaignSlug, id }),
      children,
    });

    expect(notFound).not.toHaveBeenCalled();
    const serialized = JSON.stringify(result);
    expect(serialized).toContain(subrouteMarker);
  });

  it("should allow access when the user is a campaign master (even if not owner)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "staff-1" },
    });
    (getCampaignBySlug as Mock).mockResolvedValue({
      ...mockCampaign({ id: 7 }),
      organization: mockOrganization(),
    });
    (getCharacterByIdScoped as Mock).mockResolvedValue({
      id: 1,
      campaignId: 7,
      userId: "user-2",
    });
    (isUserCampaignMaster as Mock).mockResolvedValue(true);
    (isUserCampaignHelper as Mock).mockResolvedValue(false);

    const result = await CharacterLayout({
      params: Promise.resolve({ campaignSlug, id }),
      children,
    });

    expect(notFound).not.toHaveBeenCalled();
    const serialized = JSON.stringify(result);
    expect(serialized).toContain(subrouteMarker);
  });

  it("should call notFound when the requester is neither owner nor master (404, not 403, to avoid revealing existence)", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-3" },
    });
    (getCampaignBySlug as Mock).mockResolvedValue({
      ...mockCampaign({ id: 7 }),
      organization: mockOrganization(),
    });
    (getCharacterByIdScoped as Mock).mockResolvedValue({
      id: 1,
      campaignId: 7,
      userId: "user-2",
    });
    (isUserCampaignMaster as Mock).mockResolvedValue(false);
    (isUserCampaignHelper as Mock).mockResolvedValue(false);

    await expect(
      CharacterLayout({
        params: Promise.resolve({ campaignSlug, id }),
        children,
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
  });

  it("should check the master role for the effective user against the resolved campaign id", async () => {
    (auth.api.getSession as unknown as Mock).mockResolvedValue({
      user: { id: "user-42" },
    });
    (getCampaignBySlug as Mock).mockResolvedValue({
      ...mockCampaign({ id: 9 }),
      organization: mockOrganization(),
    });
    (getCharacterByIdScoped as Mock).mockResolvedValue({
      id: 3,
      campaignId: 9,
      userId: "someone-else",
    });
    (isUserCampaignMaster as Mock).mockResolvedValue(true);
    (isUserCampaignHelper as Mock).mockResolvedValue(false);

    await CharacterLayout({
      params: Promise.resolve({ campaignSlug, id: "3" }),
      children,
    });

    expect(getCharacterByIdScoped).toHaveBeenCalledWith(
      expect.anything(),
      3,
      ARCANA_DOMINE_SLUG,
      campaignSlug
    );
    expect(isUserCampaignMaster).toHaveBeenCalledWith(
      expect.anything(),
      "user-42",
      9
    );
  });
});
