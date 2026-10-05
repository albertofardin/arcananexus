import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BtnNotifications from "../BtnNotifications";
import { useNotifications } from "@/lib/queries/notifications";

// Stesso approccio di `ImpersonationToolbar.test.tsx`: mock del modulo
// query invece di MSW, il componente sotto test non deve fare rete reale.
// La parte "apri il popover e clicca una riga" non è coperta qui — nessun
// test esistente nel repo esercita `Popover`/`Modal` (Radix) montati/aperti
// in jsdom (nemmeno `BtnUser`, stesso pattern), quindi restiamo sul
// comportamento sempre visibile del trigger (pallino/badge), verificato
// manualmente via API reale + dev server (vedi riepilogo del task).
vi.mock("@/lib/queries/notifications", () => ({
  useNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

const renderBtn = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BtnNotifications />
    </QueryClientProvider>
  );
};

describe("BtnNotifications — trigger in sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mostra l'etichetta 'Notifiche' senza conteggio quando non ci sono notifiche non lette", () => {
    (useNotifications as unknown as Mock).mockReturnValue({
      data: { notifications: [], unreadCount: 0 },
      isPending: false,
    });

    renderBtn();

    expect(screen.getByText("Notifiche")).toBeInTheDocument();
  });

  it("mostra il numero di notifiche non lette nell'etichetta del trigger", () => {
    (useNotifications as unknown as Mock).mockReturnValue({
      data: { notifications: [], unreadCount: 3 },
      isPending: false,
    });

    renderBtn();

    expect(screen.getByText("Notifiche")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("tronca il conteggio a '99+' oltre le 99 notifiche non lette", () => {
    (useNotifications as unknown as Mock).mockReturnValue({
      data: { notifications: [], unreadCount: 150 },
      isPending: false,
    });

    renderBtn();

    expect(screen.getByText("Notifiche")).toBeInTheDocument();
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("non esplode mentre i dati sono ancora in caricamento (nessun dato)", () => {
    (useNotifications as unknown as Mock).mockReturnValue({
      data: undefined,
      isPending: true,
    });

    renderBtn();

    expect(screen.getByText("Notifiche")).toBeInTheDocument();
  });
});
