import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import FormDemandPassword from "./FormDemandPassword";

// FieldText (usato da FieldInput) propaga il valore solo dopo il proprio
// debounce (500ms), stesso pattern già in uso altrove nel repo (vedi
// `ManagerDataTypes.test.tsx`).
const typeEmail = async (value: string) => {
  const input = screen.getByPlaceholderText("email@dominio.com");
  fireEvent.change(input, { target: { value } });
  await new Promise(resolve => setTimeout(resolve, 600));
};

// `Btn`/`BtnBase` distinguono singolo/doppio click da `event.detail` (vedi
// `BtnBase.tsx`): senza `detail: 1`, `fireEvent.click` non attiva l'handler.
const click1 = (el: HTMLElement) => fireEvent.click(el, { detail: 1 });

describe("FormDemandPassword (T-046)", () => {
  it("richiede il reset con solo l'email, senza alcun campo tenantId", async () => {
    const onRequest = vi.fn().mockResolvedValue({ success: true, message: [] });
    render(<FormDemandPassword goBack={vi.fn()} onRequest={onRequest} />);

    // Niente campo azienda/tenant: era il campo legacy multi-tenant rimosso
    // da questo form (T-046).
    expect(screen.queryByLabelText(/company/i)).not.toBeInTheDocument();

    await typeEmail("utente@example.com");
    click1(screen.getByRole("button", { name: /^reimposta$/i }));

    await waitFor(() =>
      expect(onRequest).toHaveBeenCalledWith({ username: "utente@example.com" })
    );
    expect(
      await screen.findByText(
        "Ti abbiamo inviato un'email con un link per reimpostare la tua password"
      )
    ).toBeInTheDocument();
  });

  it("mostra sempre lo stesso messaggio di successo generico, anche se onRequest riporta un esito indistinguibile per email inesistenti", async () => {
    // Il criterio "niente enumerazione utenti" è garantito lato server
    // (Better Auth risponde sempre `status:true`): qui verifichiamo solo che
    // il form non abbia un ramo UI diverso per email esistente/inesistente.
    const onRequest = vi.fn().mockResolvedValue({ success: true, message: [] });
    render(<FormDemandPassword goBack={vi.fn()} onRequest={onRequest} />);

    await typeEmail("non-esiste@example.com");
    click1(screen.getByRole("button", { name: /^reimposta$/i }));

    expect(
      await screen.findByText(
        "Ti abbiamo inviato un'email con un link per reimpostare la tua password"
      )
    ).toBeInTheDocument();
  });

  it("mostra un errore se la richiesta fallisce", async () => {
    const onRequest = vi
      .fn()
      .mockResolvedValue({ success: false, message: ["Troppi tentativi"] });
    render(<FormDemandPassword goBack={vi.fn()} onRequest={onRequest} />);

    await typeEmail("utente@example.com");
    click1(screen.getByRole("button", { name: /^reimposta$/i }));

    expect(await screen.findByText("Troppi tentativi")).toBeInTheDocument();
  });

  it("disabilita il bottone finché l'email non è valida", async () => {
    // Il componente `Btn` sottostante espone `role="button"` solo quando
    // abilitato, `role="presentation"` da disabilitato (vedi `BtnBase.tsx`):
    // non è quindi un elemento nativo `<button>` interrogabile con
    // `toBeDisabled()`.
    render(<FormDemandPassword goBack={vi.fn()} onRequest={vi.fn()} />);
    const submitLabel = () => screen.getByText(/^reimposta$/i);
    expect(submitLabel().closest("[role]")).toHaveAttribute(
      "role",
      "presentation"
    );

    await typeEmail("non-valida");
    expect(submitLabel().closest("[role]")).toHaveAttribute(
      "role",
      "presentation"
    );
  });
});
