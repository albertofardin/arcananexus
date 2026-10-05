import { describe, it, expect, vi } from "vitest";
import { useRouter } from "next/navigation";
import NotFound from "./not-found";
import { render, screen, fireEvent } from "@/test/helpers/test-utils";

describe("App Not Found Page", () => {
  it("should render 404 heading", () => {
    render(<NotFound />);

    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("should render page not found message", () => {
    render(<NotFound />);

    expect(screen.getByText("Pagina non trovata")).toBeInTheDocument();
    expect(
      screen.getByText("La pagina che stai cercando non esiste.")
    ).toBeInTheDocument();
  });

  it("should navigate to home page on button click", () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push,
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    } as unknown as ReturnType<typeof useRouter>);

    render(<NotFound />);

    const homeButton = screen.getByRole("button", { name: /torna alla home/i });
    // BtnBase gestisce solo click con event.detail === 1
    fireEvent.click(homeButton, { detail: 1 });

    expect(push).toHaveBeenCalledWith("/");
  });
});
