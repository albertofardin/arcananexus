import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
  vi,
  type Mock,
} from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { useRouter } from "next/navigation";
import ImpersonationToolbar from "../ImpersonationToolbar";
import UsersManager from "@/components/UsersManager";
import ToastProvider from "@/components/_core/Toast";
import { useQueryAdminUsers } from "@/lib/queries/adminUsers";
import { useSession } from "@/lib/auth-client";
import { useCapabilities } from "@/lib/queries/capabilities";
import type { AdminUser } from "@/lib/validations/user";

/**
 * Test di integrazione end-to-end del ciclo di impersonation:
 * "Impersona" in UsersManager → GET status → banner → "Esci
 * dall'impersonazione" → status torna a false. A differenza degli altri test
 * (che mockano `@/lib/queries/impersonation`), qui le tre route sono servite
 * da MSW così da esercitare davvero fetch + parsing Zod + il polling dello
 * stato condiviso fra i due componenti (montati insieme, come nel layout
 * reale: la toolbar sopra, UsersManager dentro il workspace).
 */

vi.mock("@/lib/queries/adminUsers", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/queries/adminUsers")
  >("@/lib/queries/adminUsers");
  return { ...actual, useQueryAdminUsers: vi.fn() };
});
vi.mock("@/lib/auth-client", () => ({
  useSession: vi.fn(),
  authClient: { $store: { notify: vi.fn() } },
}));
vi.mock("@/lib/queries/capabilities", () => ({ useCapabilities: vi.fn() }));

const ADMIN = { id: "admin-1", name: "Super Admin", email: "mattia@arcana.it" };
const TARGET = {
  id: "user-target",
  name: "Utente Target",
  email: "target@example.com",
};

const targetAsAdminUser: AdminUser = {
  id: TARGET.id,
  name: TARGET.name,
  email: TARGET.email,
  emailVerified: true,
  image: null,
  createdAt: new Date("2024-01-01"),
  personalData: null,
  membershipYears: [],
};

// Stato server in-memory: true dopo /start, false dopo /end — riproduce
// esattamente il contratto di src/lib/impersonation.ts senza toccarlo.
let impersonating = false;

const server = setupServer(
  http.get("/api/admin/impersonate/status", () =>
    HttpResponse.json({
      isImpersonating: impersonating,
      activeUser: impersonating ? TARGET : ADMIN,
      adminUser: impersonating ? ADMIN : null,
    })
  ),
  http.post("/api/admin/impersonate/start", () => {
    impersonating = true;
    return HttpResponse.json({ success: true, targetUser: TARGET });
  }),
  http.post("/api/admin/impersonate/end", () => {
    impersonating = false;
    return HttpResponse.json({ success: true });
  })
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  impersonating = false;
});
afterAll(() => server.close());

const renderApp = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ImpersonationToolbar />
        <UsersManager />
      </ToastProvider>
    </QueryClientProvider>
  );
};

describe("Impersonation — flusso end-to-end start → banner → end (MSW)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    } as unknown as ReturnType<typeof useRouter>);
    (useSession as unknown as Mock).mockReturnValue({
      data: { user: ADMIN },
    });
    (useCapabilities as unknown as Mock).mockReturnValue({
      data: {
        isDirettivo: false,
        isSviluppo: true,
        masterCampaigns: [],
      },
    });
    (useQueryAdminUsers as unknown as Mock).mockReturnValue({
      data: {
        users: [targetAsAdminUser],
        availableYears: [],
        pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
      },
      isPending: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("nessun banner all'avvio (nessuna impersonation attiva)", async () => {
    renderApp();

    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument()
    );
  });

  it("avviare l'impersonazione mostra il banner; uscirne lo fa sparire", async () => {
    renderApp();

    // 1. Nessun banner all'inizio.
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument()
    );

    // 2. Avvio dell'impersonazione da UsersManager.
    const impersonaButton = screen.getByRole("button", { name: /impersona/i });
    fireEvent.click(impersonaButton, { detail: 1 });

    // 3. Il banner compare con l'utente impersonato.
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(
      screen.getByText(new RegExp(`Stai impersonando ${TARGET.name}`))
    ).toBeInTheDocument();

    // 4. Uscita dall'impersonazione dal banner.
    const exitButton = screen.getByRole("button", {
      name: /esci dall'impersonazione/i,
    });
    fireEvent.click(exitButton, { detail: 1 });

    // 5. Il banner sparisce.
    await waitForElementToBeRemoved(() => screen.queryByRole("status"));
  });
});
