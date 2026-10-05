import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { notFound } from "next/navigation";
// vi.mock è hoisted sopra gli import: importare qui i moduli mockati è sicuro
import AdminLayout from "../layout";
import { getEffectiveUserId, hasAdminSectionAccess } from "@/lib/authorization";

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

vi.mock("@/lib/authorization", () => ({
  getEffectiveUserId: vi.fn(),
  hasAdminSectionAccess: vi.fn(),
}));

// Guardia "direttivo o sviluppo web" (T-045) per l'intera sezione dashboard/admin/
// (home + tutte le sottorotte: admin/users, admin/roles, ...).
describe("AdminLayout — guardia direttivo/sviluppo web (home + sottorotte admin/)", () => {
  const subrouteMarker = "PROTECTED_SUBROUTE_CONTENT_MARKER";
  const children = <div>{subrouteMarker}</div>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call notFound when there is no effective user (no session)", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue(null);

    await expect(AdminLayout({ children })).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
    expect(hasAdminSectionAccess).not.toHaveBeenCalled();
  });

  it("should block the children with a clean message when the guard fails (403-like)", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-1");
    (hasAdminSectionAccess as Mock).mockResolvedValue(false);

    const result = await AdminLayout({ children });

    expect(notFound).not.toHaveBeenCalled();
    const serialized = JSON.stringify(result);
    expect(serialized).toContain("Permessi insufficienti");
    expect(serialized).not.toContain(subrouteMarker);
  });

  it("should render the children when the guard passes (direttivo member or sviluppo web)", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-1");
    (hasAdminSectionAccess as Mock).mockResolvedValue(true);

    const result = await AdminLayout({ children });

    expect(notFound).not.toHaveBeenCalled();
    const serialized = JSON.stringify(result);
    expect(serialized).toContain(subrouteMarker);
    expect(serialized).not.toContain("Permessi insufficienti");
  });

  it("should check the guard for the effective (impersonation-aware) user id", async () => {
    (getEffectiveUserId as Mock).mockResolvedValue("user-42");
    (hasAdminSectionAccess as Mock).mockResolvedValue(true);

    await AdminLayout({ children });

    expect(hasAdminSectionAccess).toHaveBeenCalledWith(
      expect.anything(),
      "user-42"
    );
  });
});
