import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DesignerToolbar, {
  type DesignerSelectionInfo,
} from "../DesignerToolbar";

const textSelection = (
  name: string,
  fontSize: number
): DesignerSelectionInfo => ({
  type: "text",
  schema: { fontSize },
  targets: [{ name, pageIndex: 0 }],
});

describe("DesignerToolbar — campi numerici", () => {
  it("applies the typed size on Enter, clamped to the allowed range", () => {
    const onApply = vi.fn();
    render(
      <DesignerToolbar
        selection={textSelection("Nome", 11)}
        onApply={onApply}
        onDelete={() => {}}
      />
    );
    const input = screen.getByLabelText("Dimensione");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "500" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({ fontSize: 96 }, [
      { name: "Nome", pageIndex: 0 },
    ]);
  });

  it("applies the value to the element selected at focus, even if the selection changes before blur", () => {
    const onApply = vi.fn();
    const { rerender } = render(
      <DesignerToolbar
        selection={textSelection("Nome", 11)}
        onApply={onApply}
        onDelete={() => {}}
      />
    );
    const input = screen.getByLabelText("Dimensione");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "20" } });
    // Clic su un altro testo nel designer prima di uscire dal campo.
    rerender(
      <DesignerToolbar
        selection={textSelection("Titolo", 14)}
        onApply={onApply}
        onDelete={() => {}}
      />
    );
    fireEvent.blur(input);

    expect(onApply).toHaveBeenCalledWith({ fontSize: 20 }, [
      { name: "Nome", pageIndex: 0 },
    ]);
    // Dopo la conferma il campo mostra il valore dell'elemento ora selezionato.
    expect((input as HTMLInputElement).value).toBe("14");
  });

  it("does not apply anything on Escape or for a non-numeric value", () => {
    const onApply = vi.fn();
    render(
      <DesignerToolbar
        selection={textSelection("Nome", 11)}
        onApply={onApply}
        onDelete={() => {}}
      />
    );
    const input = screen.getByLabelText("Margine interno");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    expect(onApply).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe("0");
  });
});
