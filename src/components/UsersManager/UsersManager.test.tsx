import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import UsersManager from "./UsersManager";
import ToastProvider from "@/components/_core/Toast";
import { useQueryAdminUsers } from "@/lib/queries/adminUsers";
import { useSession } from "@/lib/auth-client";
import { useCapabilities } from "@/lib/queries/capabilities";
import { startImpersonation } from "@/lib/queries/impersonation";
import type { AdminUser } from "@/lib/validations/user";

vi.mock("@/lib/queries/adminUsers", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/queries/adminUsers")
  >("@/lib/queries/adminUsers");
  return {
    ...actual,
    useQueryAdminUsers: vi.fn(),
  };
});
vi.mock("@/lib/auth-client", () => ({
  useSession: vi.fn(),
}));
vi.mock("@/lib/queries/capabilities", () => ({
  useCapabilities: vi.fn(),
}));
vi.mock("@/lib/queries/impersonation", () => ({
  startImpersonation: vi.fn(),
}));

const buildUser = (overrides: Partial<AdminUser> = {}): AdminUser => ({
  id: "user-other",
  name: "Altro Utente",
  email: "altro@example.com",
  emailVerified: true,
  image: null,
  createdAt: new Date("2024-01-01"),
  personalData: null,
  membershipYears: [],
  ...overrides,
});

const SELF = buildUser({
  id: "user-self",
  name: "Utente Corrente",
  email: "self@example.com",
});
const OTHER = buildUser();

let queryClient: QueryClient;

const renderManager = () => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <UsersManager />
      </ToastProvider>
    </QueryClientProvider>
  );
};

const mockUsersManagerData = (users: AdminUser[]) => {
  (useQueryAdminUsers as unknown as Mock).mockReturnValue({
    data: {
      users,
      availableYears: [],
      pagination: { page: 1, pageSize: 50, total: users.length, totalPages: 1 },
    },
    isPending: false,
    error: null,
    refetch: vi.fn(),
  });
};

describe("UsersManager — azione 'Impersona'", () => {
  const push = vi.fn();
  const refresh = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({
      push,
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh,
    } as unknown as ReturnType<typeof useRouter>);
    (useSession as unknown as Mock).mockReturnValue({
      data: { user: { id: SELF.id, name: SELF.name, email: SELF.email } },
    });
    mockUsersManagerData([SELF, OTHER]);
  });

  it("non mostra l'azione per un utente non sviluppo web", () => {
    (useCapabilities as unknown as Mock).mockReturnValue({
      data: {
        isDirettivo: false,
        isSviluppo: false,
        masterCampaigns: [],
      },
    });

    renderManager();

    expect(
      screen.queryAllByRole("button", { name: /impersona/i })
    ).toHaveLength(0);
  });

  it("non mostra l'azione per un direttivo non sviluppo web (impersonation è riservata a sviluppo web)", () => {
    (useCapabilities as unknown as Mock).mockReturnValue({
      data: {
        isDirettivo: true,
        isSviluppo: false,
        masterCampaigns: [],
      },
    });

    renderManager();

    expect(
      screen.queryAllByRole("button", { name: /impersona/i })
    ).toHaveLength(0);
  });

  it("per sviluppo web mostra l'azione sulle altre righe ma non sulla propria", () => {
    (useCapabilities as unknown as Mock).mockReturnValue({
      data: {
        isDirettivo: false,
        isSviluppo: true,
        masterCampaigns: [],
      },
    });

    renderManager();

    const otherRow = screen.getByText(OTHER.name).closest("button")
      ?.parentElement as HTMLElement;
    const selfRow = screen.getByText(SELF.name).closest("button")
      ?.parentElement as HTMLElement;

    expect(
      within(otherRow).getByRole("button", { name: /impersona/i })
    ).toBeInTheDocument();
    expect(
      within(selfRow).queryByRole("button", { name: /impersona/i })
    ).not.toBeInTheDocument();
  });

  it("non mostra l'azione su nessuna riga finché la sessione non è ancora caricata (evita il falso positivo su session?.user?.id undefined)", () => {
    (useCapabilities as unknown as Mock).mockReturnValue({
      data: {
        isDirettivo: false,
        isSviluppo: true,
        masterCampaigns: [],
      },
    });
    (useSession as unknown as Mock).mockReturnValue({ data: undefined });

    renderManager();

    expect(
      screen.queryAllByRole("button", { name: /impersona/i })
    ).toHaveLength(0);
  });

  it("happy path: avvia l'impersonazione, svuota la cache, reindirizza alla home e forza il refresh degli RSC", async () => {
    (useCapabilities as unknown as Mock).mockReturnValue({
      data: {
        isDirettivo: false,
        isSviluppo: true,
        masterCampaigns: [],
      },
    });
    (startImpersonation as unknown as Mock).mockResolvedValue({
      success: true,
      targetUser: { id: OTHER.id, name: OTHER.name, email: OTHER.email },
    });

    renderManager();
    const clearSpy = vi.spyOn(queryClient, "clear");

    const impersonaButton = screen.getByRole("button", { name: /impersona/i });
    // BtnBase gestisce solo click con event.detail === 1
    fireEvent.click(impersonaButton, { detail: 1 });

    await waitFor(() =>
      expect(startImpersonation).toHaveBeenCalledWith(OTHER.id)
    );
    await waitFor(() => expect(clearSpy).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith("/dashboard");
    // router.refresh() è indispensabile: senza, gli RSC in Router Cache
    // resterebbero serviti con l'identità admin sotto il banner di
    // impersonation (vedi ImpersonationToolbar).
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("mostra un toast di errore se l'avvio dell'impersonazione fallisce", async () => {
    (useCapabilities as unknown as Mock).mockReturnValue({
      data: {
        isDirettivo: false,
        isSviluppo: true,
        masterCampaigns: [],
      },
    });
    (startImpersonation as unknown as Mock).mockRejectedValue(
      new Error("boom")
    );

    renderManager();

    const impersonaButton = screen.getByRole("button", { name: /impersona/i });
    fireEvent.click(impersonaButton, { detail: 1 });

    expect(
      await screen.findByText(/Impossibile avviare l'impersonazione/i)
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
