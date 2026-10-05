import { describe, it, expect, vi } from "vitest";
import Error from "./error";
import { render, screen, fireEvent } from "@/test/helpers/test-utils";

describe("Dashboard Error Boundary", () => {
  const mockError = {
    message: "Test error message",
    name: "Error",
    digest: "test-digest",
  } as Error & { digest?: string };
  const mockReset = vi.fn();

  it("should render error message", () => {
    render(<Error error={mockError} reset={mockReset} />);

    expect(screen.getByText("Qualcosa è andato storto")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Si è verificato un errore durante il caricamento della dashboard/i
      )
    ).toBeInTheDocument();
  });

  it("should display error details when provided", () => {
    render(<Error error={mockError} reset={mockReset} />);

    expect(
      screen.getByText(/Dettagli: Test error message/)
    ).toBeInTheDocument();
  });

  it("should call reset when retry button is clicked", () => {
    render(<Error error={mockError} reset={mockReset} />);

    const retryButton = screen.getByRole("button", { name: /riprova/i });
    // BtnBase gestisce solo click con event.detail === 1
    fireEvent.click(retryButton, { detail: 1 });

    expect(mockReset).toHaveBeenCalledOnce();
  });

  it("should render error icon", () => {
    const { container } = render(<Error error={mockError} reset={mockReset} />);

    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
