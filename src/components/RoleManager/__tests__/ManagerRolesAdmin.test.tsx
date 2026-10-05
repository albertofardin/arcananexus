import { describe, it, expect, afterEach, vi, type Mock } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import ManagerRolesAdmin from "../ManagerRolesAdmin";
import { render } from "@/test/helpers/test-utils";
import ToastProvider from "@/components/_core/Toast";
import { useCapabilities } from "@/lib/queries/capabilities";

vi.mock("@/lib/queries/capabilities", () => ({
  useCapabilities: vi.fn(),
}));

vi.mock("../ManagerRoles", () => ({
  __esModule: true,
  default: ({
    campaigns,
    flatGroups,
  }: {
    campaigns: { slug: string }[];
    flatGroups: { id: string; memberIds: string[]; editable?: boolean }[];
  }) => (
    <div data-testid="roles-manager">
      {campaigns.map(c => (
        <span key={c.slug} data-testid="campaign-scope">
          {c.slug}
        </span>
      ))}
      {flatGroups.map(g => (
        <span
          key={g.id}
          data-testid={`flat-group-${g.id}`}
          data-editable={g.editable ?? true}
        >
          {g.memberIds.join(",")}
        </span>
      ))}
    </div>
  ),
  DIRETTIVO_ID: "direttivo",
  SVILUPPO_ID: "sviluppo",
}));

const overviewResponse = {
  campaigns: [],
  users: [
    { id: "u1", name: "Mario Rossi", email: "mario@example.com", image: null },
  ],
  direttivoMemberIds: ["u2"],
  sviluppoMemberIds: ["u3"],
};

const stubFetch = () =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => overviewResponse })
  );

describe("ManagerRolesAdmin — niente più vista campagne, solo i due gruppi flat", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("non renderizza mai alcuno scope di campagna, per nessun utente (il bypass generico è stato rimosso)", async () => {
    (useCapabilities as unknown as Mock).mockReturnValue({
      data: { isDirettivo: true, isSviluppo: false, masterCampaigns: [] },
    });
    stubFetch();

    render(
      <ToastProvider>
        <ManagerRolesAdmin />
      </ToastProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("roles-manager")).toBeInTheDocument()
    );
    expect(screen.queryByTestId("campaign-scope")).not.toBeInTheDocument();
  });

  it("passa il gruppo Sviluppo Web come non editabile per un direttivo non-sviluppo", async () => {
    (useCapabilities as unknown as Mock).mockReturnValue({
      data: { isDirettivo: true, isSviluppo: false, masterCampaigns: [] },
    });
    stubFetch();

    render(
      <ToastProvider>
        <ManagerRolesAdmin />
      </ToastProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("flat-group-sviluppo")).toHaveAttribute(
        "data-editable",
        "false"
      )
    );
    expect(screen.getByTestId("flat-group-sviluppo")).toHaveTextContent("u3");
    expect(screen.getByTestId("flat-group-direttivo")).toHaveTextContent("u2");
  });

  it("passa il gruppo Sviluppo Web come editabile per un utente sviluppo web", async () => {
    (useCapabilities as unknown as Mock).mockReturnValue({
      data: { isDirettivo: false, isSviluppo: true, masterCampaigns: [] },
    });
    stubFetch();

    render(
      <ToastProvider>
        <ManagerRolesAdmin />
      </ToastProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("flat-group-sviluppo")).toHaveAttribute(
        "data-editable",
        "true"
      )
    );
  });
});
