import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import ImpersonationToolbar from "../ImpersonationToolbar";
import ToastProvider from "@/components/_core/Toast";
import {
  useQueryImpersonationStatus,
  endImpersonation,
} from "@/lib/queries/impersonation";

vi.mock("@/lib/queries/impersonation", () => ({
  useQueryImpersonationStatus: vi.fn(),
  endImpersonation: vi.fn(),
}));

// Wrapper minimo con gli stessi provider montati in (dashboard)/layout.tsx:
// il componente usa sia react-query (stato + queryClient.clear) sia il
// contesto di ToastProvider (errore sull'uscita).
const renderToolbar = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ImpersonationToolbar />
      </ToastProvider>
    </QueryClientProvider>
  );
};

describe("ImpersonationToolbar — banner condizionale su isImpersonating", () => {
  const refresh = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh,
    } as unknown as ReturnType<typeof useRouter>);
  });

  it("non mostra nulla mentre lo stato non è ancora caricato (default sicuro)", () => {
    (useQueryImpersonationStatus as unknown as Mock).mockReturnValue({
      data: undefined,
    });

    renderToolbar();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("non mostra nulla quando isImpersonating è false", () => {
    (useQueryImpersonationStatus as unknown as Mock).mockReturnValue({
      data: {
        isImpersonating: false,
        activeUser: {
          id: "u1",
          name: "Mario Rossi",
          email: "mario@example.com",
        },
        adminUser: null,
      },
    });

    renderToolbar();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("mostra la barra con nome ed email dell'utente impersonato quando isImpersonating è true", () => {
    (useQueryImpersonationStatus as unknown as Mock).mockReturnValue({
      data: {
        isImpersonating: true,
        activeUser: {
          id: "u1",
          name: "Mario Rossi",
          email: "mario@example.com",
        },
        adminUser: { id: "a1", name: "Admin", email: "mattia@arcana.it" },
      },
    });

    renderToolbar();

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(
      screen.getByText(/Stai impersonando Mario Rossi \(mario@example.com\)/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /esci dall'impersonazione/i })
    ).toBeInTheDocument();
  });

  it("'Esci dall'impersonazione' chiama endImpersonation e ricarica lo stato della pagina", async () => {
    (useQueryImpersonationStatus as unknown as Mock).mockReturnValue({
      data: {
        isImpersonating: true,
        activeUser: {
          id: "u1",
          name: "Mario Rossi",
          email: "mario@example.com",
        },
        adminUser: { id: "a1", name: "Admin", email: "mattia@arcana.it" },
      },
    });
    (endImpersonation as unknown as Mock).mockResolvedValue(undefined);

    renderToolbar();

    const exitButton = screen.getByRole("button", {
      name: /esci dall'impersonazione/i,
    });
    // BtnBase gestisce solo click con event.detail === 1
    fireEvent.click(exitButton, { detail: 1 });

    await waitFor(() => expect(endImpersonation).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("mostra un toast di errore se l'uscita dall'impersonazione fallisce", async () => {
    (useQueryImpersonationStatus as unknown as Mock).mockReturnValue({
      data: {
        isImpersonating: true,
        activeUser: {
          id: "u1",
          name: "Mario Rossi",
          email: "mario@example.com",
        },
        adminUser: { id: "a1", name: "Admin", email: "mattia@arcana.it" },
      },
    });
    (endImpersonation as unknown as Mock).mockRejectedValue(new Error("boom"));

    renderToolbar();

    const exitButton = screen.getByRole("button", {
      name: /esci dall'impersonazione/i,
    });
    fireEvent.click(exitButton, { detail: 1 });

    expect(
      await screen.findByText(/Impossibile uscire dall'impersonazione/i)
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
