import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { Role } from "@prisma/client";
import { notFound } from "next/navigation";
// vi.mock è hoisted sopra gli import: importare qui i moduli mockati è sicuro
import CampaignAdminLayout from "../layout";
import { checkCampaignAccess, getEffectiveUserId } from "@/lib/authorization";
import { getCampaignBySlug } from "@/lib/repositories/campaign.repository";
import { mockCampaign, mockOrganization } from "@/test/helpers/prisma-fixtures";

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

vi.mock("@/lib/repositories/campaign.repository", () => ({
  getCampaignBySlug: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({
  checkCampaignAccess: vi.fn(),
  getEffectiveUserId: vi.fn(),
}));

// Guardia ruolo di progetto (T-3) per l'intera sezione admin/ (home + tutte le
// sottorotte: admin/roles, admin/actions, ...), inlined direttamente qui
// (ex CampaignRoleGuard, ora eliminato — un solo componente, niente indirezione).
describe("CampaignAdminLayout — guardia ruolo di progetto (home + sottorotte admin/)", () => {
  const campaignSlug = "test-campaign";
  const subrouteMarker = "PROTECTED_SUBROUTE_CONTENT_MARKER";
  const children = <div>{subrouteMarker}</div>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call notFound when there is no effective user (no session)", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue(null);

    await expect(
      CampaignAdminLayout({
        params: Promise.resolve({ campaignSlug }),
        children,
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
    expect(checkCampaignAccess).not.toHaveBeenCalled();
  });

  it("should call notFound when the campaign does not exist", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-1");
    (getCampaignBySlug as Mock).mockResolvedValue(null);

    await expect(
      CampaignAdminLayout({
        params: Promise.resolve({ campaignSlug }),
        children,
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
  });

  it("should block the children with a clean message when the role guard fails (403-like)", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-1");
    (getCampaignBySlug as Mock).mockResolvedValue({
      ...mockCampaign(),
      organization: mockOrganization(),
    });
    (checkCampaignAccess as Mock).mockResolvedValue(false);

    const result = await CampaignAdminLayout({
      params: Promise.resolve({ campaignSlug }),
      children,
    });

    expect(notFound).not.toHaveBeenCalled();
    const serialized = JSON.stringify(result);
    expect(serialized).toContain("Permessi insufficienti");
    expect(serialized).not.toContain(subrouteMarker);
  });

  it("should render the children when the role guard passes", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-1");
    (getCampaignBySlug as Mock).mockResolvedValue({
      ...mockCampaign(),
      organization: mockOrganization(),
    });
    (checkCampaignAccess as Mock).mockResolvedValue(true);

    const result = await CampaignAdminLayout({
      params: Promise.resolve({ campaignSlug }),
      children,
    });

    expect(notFound).not.toHaveBeenCalled();
    const serialized = JSON.stringify(result);
    expect(serialized).toContain(subrouteMarker);
    expect(serialized).not.toContain("Permessi insufficienti");
  });

  it("should check the role guard for the effective (impersonation-aware) user id, the resolved campaign id and the required role supporter", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-42");
    (getCampaignBySlug as Mock).mockResolvedValue({
      ...mockCampaign({ id: 7 }),
      organization: mockOrganization(),
    });
    (checkCampaignAccess as Mock).mockResolvedValue(true);

    await CampaignAdminLayout({
      params: Promise.resolve({ campaignSlug }),
      children,
    });

    expect(checkCampaignAccess).toHaveBeenCalledWith(
      expect.anything(),
      "user-42",
      7,
      Role.supporter
    );
  });

  it("should not allow a staff member of campaign A to pass the guard scoped to campaign B (cross-tenant)", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-1");
    (getCampaignBySlug as Mock).mockResolvedValue({
      ...mockCampaign({ id: 2, slug: "campaign-b" }),
      organization: mockOrganization(),
    });
    // Il guard interroga il Grant sulla campagna B risolta dallo slug: nessun
    // Grant lì per user-1 (che ha un ruolo solo sulla campagna A).
    (checkCampaignAccess as Mock).mockResolvedValue(false);

    const result = await CampaignAdminLayout({
      params: Promise.resolve({ campaignSlug: "campaign-b" }),
      children,
    });

    expect(checkCampaignAccess).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      2,
      Role.supporter
    );
    const serialized = JSON.stringify(result);
    expect(serialized).toContain("Permessi insufficienti");
  });

  it("propagates the campaignSlug of the current route (multi-tenant: no hardcoded slug)", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-1");
    (getCampaignBySlug as Mock).mockResolvedValue({
      ...mockCampaign({ slug: "other-campaign" }),
      organization: mockOrganization(),
    });
    (checkCampaignAccess as Mock).mockResolvedValue(true);

    await CampaignAdminLayout({
      params: Promise.resolve({ campaignSlug: "other-campaign" }),
      children: <div>content</div>,
    });

    expect(getCampaignBySlug).toHaveBeenCalledWith(
      expect.anything(),
      "other-campaign",
      expect.anything()
    );
  });
});
